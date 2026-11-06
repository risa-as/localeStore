import { prisma } from "@/db/prisma";
import { insertOrderSchema } from "@/lib/validators";
import { computeItemsPriceTotal, computeOrderPricing } from "@/lib/pricing";
import { reserveOrderStock } from "./reservations";
import { appendNote, decideItemMerge, decideShippingUpdate, differentAddressNote, duplicateNote } from "./merge-policy";
import { sendOrderConfirmation } from "@/lib/whatsapp";
import { quickOrderCustomerSchema, quickOrderLinesSchema, type QuickOrderCustomer, type QuickOrderLine } from "./quick-order-input";
import type { z } from "zod";

export type QuickOrderData = z.infer<typeof insertOrderSchema>;
type Receipt = { requestKey: string; pageId: string; platform: string; conversationId: string; createdBy: string };
type Options = {
  userId?: string; ip?: string | null; banned?: boolean;
  canMerge: (order: { id: string; userId: string | null }) => Promise<boolean>;
  receipt?: Receipt;
};

/** Shared checkout for landing pages and staff-assisted social orders. */
export async function submitQuickOrder(input: QuickOrderData, productId: string, options: Options) {
  return submitQuickOrderItems(input, [{ productId, quantity: input.quantity, selectedColor: input.selectedColor }], options);
}

/** Save one or more distinct products in a single order and reservation. */
export async function submitQuickOrderItems(input: QuickOrderCustomer, lines: QuickOrderLine[], options: Options) {
  const data = quickOrderCustomerSchema.parse(input);
  const requested = quickOrderLinesSchema.parse(lines);
  const quantity = requested.reduce((sum, line) => sum + line.quantity, 0);
  const single = requested.length === 1 ? requested[0] : null;
  // Preserve the existing receipt format for single-item orders. Reordering a
  // multi-item draft must not change its identity on a retry.
  const snapshot = JSON.stringify(single
    ? { ...data, quantity: single.quantity, selectedColor: single.selectedColor, productId: single.productId }
    : { ...data, items: [...requested].sort((a, b) => a.productId.localeCompare(b.productId)) });
  const result = await prisma.$transaction(async tx => {
    // Serialize same-phone submissions before looking for a recent order.
    // This lock and the product reservation remain held until the same commit.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`quick-order:${data.phoneNumber}`}, 0))`;
    if (options.receipt) {
      const saved = await tx.socialInboxOrder.findUnique({ where: { requestKey: options.receipt.requestKey } });
      if (saved) {
        if (saved.snapshot !== snapshot) throw new Error("هذا الاعتماد حُفظ ببيانات مختلفة؛ افتح الطلب المحفوظ لمراجعته");
        return { orderId: saved.orderId, kind: "duplicate" as const, replay: true };
      }
    }
    const recent = await tx.order.findFirst({
      where: { phoneNumber: data.phoneNumber, status: "home", isArchived: false, createdAt: { gte: new Date(Date.now() - 18 * 3600000) } },
      orderBy: { createdAt: "desc" }, include: { orderitems: true },
    });
    const canMerge = recent ? await options.canMerge(recent) : false;
    // Lock before inserting FK-backed items, so concurrent checkouts do not
    // both hold KEY SHARE locks and then deadlock while upgrading to FOR UPDATE.
    const productIds = [...new Set([...requested.map(line => line.productId), ...(canMerge && recent ? recent.orderitems.map(item => item.productId) : [])])].sort();
    for (const id of productIds) await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id}::uuid FOR UPDATE`;
    const productsById = new Map((await tx.product.findMany({ where: { id: { in: productIds } } })).map(product => [product.id, product]));
    const requestedItems = requested.map(line => {
      const product = productsById.get(line.productId);
      if (!product || product.isArchived || product.slug === "unlinked-ad-spend")
        throw new Error(product ? `المنتج لم يعد متاحاً: ${product.name}` : "أحد المنتجات لم يعد متاحاً");
      if (product.colors.length && (!line.selectedColor || !product.colors.includes(line.selectedColor)))
        throw new Error(`اختر لوناً من الألوان المتاحة للمنتج «${product.name}»`);
      const pricing = computeOrderPricing({ quantity: line.quantity, unitPrice: Number(product.price), shippingPrice: Number(product.shippingPrice), offers: product.offers });
      return {
        productId: product.id, slug: product.slug, name: product.name, qty: line.quantity,
        image: product.images[0] || "/placeholder.jpg", price: product.price, costPrice: product.costPrice,
        offersSnapshot: product.offers, lineTotal: pricing.itemsPrice, selectedColor: line.selectedColor,
        shippingPrice: product.shippingPrice,
      };
    });
    const actualShippingCost = async () => {
      const settings = await tx.shippingSettings.upsert({ where: { id: "default" }, create: { id: "default", baghdadCost: 4, othersCost: 5 }, update: {} });
      return Number(data.governorate === "Baghdad" ? settings.baghdadCost : settings.othersCost);
    };
    let orderId: string;
    let kind: "created" | "merged" | "duplicate";
    if (recent && canMerge) {
      const shipping = decideShippingUpdate(recent, data);
      let notes = recent.notes;
      const additions = requestedItems.filter(item => {
        const decision = decideItemMerge(recent.orderitems.find(existing => existing.productId === item.productId)?.qty, item.qty);
        if (decision.kind === "append") return true;
        notes = appendNote(notes, duplicateNote(item.name, item.qty));
        return false;
      });
      kind = additions.length ? "merged" : "duplicate";
      if (shipping.kind === "keep") notes = appendNote(notes, differentAddressNote(shipping.incoming));
      if (additions.length) await tx.orderItem.createMany({ data: additions.map(item => ({ ...item, orderId: recent.id })) });
      const items = [...recent.orderitems, ...additions];
      const itemsPrice = computeItemsPriceTotal(items.map(item => ({ productId: item.productId, unitPrice: Number(item.price), quantity: item.qty })), new Map([...productsById].map(([id, product]) => [id, product.offers])));
      const shippingPrice = items.length ? Math.max(...items.map(item => Number(item.shippingPrice))) : 0;
      await tx.order.update({ where: { id: recent.id }, data: {
        totalPrice: itemsPrice + shippingPrice, shippingPrice, quantity: items.reduce((sum, item) => sum + item.qty, 0), notes,
        ...(shipping.kind === "update" ? { fullName: data.fullName, governorate: data.governorate, address: data.address, actualShippingCost: await actualShippingCost() } : {}),
        // A staff-assisted order belongs to the customer; never reassign it to the operator.
        ...(options.userId ? { userId: options.userId } : {}),
      } });
      orderId = recent.id;
    } else {
      const itemsPrice = computeItemsPriceTotal(requestedItems.map(item => ({ productId: item.productId, unitPrice: Number(item.price), quantity: item.qty })), new Map(requestedItems.map(item => [item.productId, item.offersSnapshot])));
      const shippingPrice = Math.max(...requestedItems.map(item => Number(item.shippingPrice)));
      const order = await tx.order.create({ data: {
        ...data, quantity, totalPrice: itemsPrice + shippingPrice, shippingPrice,
        status: options.banned ? "banned" : "home", actualShippingCost: await actualShippingCost(),
        userId: options.userId, ip: options.ip,
      } });
      orderId = order.id; kind = "created";
      await tx.orderItem.createMany({ data: requestedItems.map(item => ({ ...item, orderId })) });
    }
    await reserveOrderStock(tx, orderId);
    if (options.receipt) await tx.socialInboxOrder.create({ data: { ...options.receipt, snapshot, orderId } });
    return { orderId, kind, replay: false };
  }, { timeout: 15000 });

  // Sending is outside the transaction; a duplicate or an HTTP retry never sends again.
  if (result.kind !== "duplicate") {
    try {
      const order = await prisma.order.findUnique({ where: { id: result.orderId }, include: { orderitems: true } });
      if (order) await sendOrderConfirmation({ fullName: order.fullName, phoneNumber: order.phoneNumber,
        product: order.orderitems.map(item => item.name).join(" + "), quantity: order.quantity,
        itemsPrice: Number(order.totalPrice) - Number(order.shippingPrice), shippingPrice: Number(order.shippingPrice) });
    } catch (error) { console.error("Quick-order confirmation failed", error); }
  }
  return result;
}
