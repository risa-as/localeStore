import { prisma } from "@/db/prisma";
import { insertOrderSchema } from "@/lib/validators";
import { computeItemsPriceTotal, computeOrderPricing } from "@/lib/pricing";
import { reserveOrderStock } from "./reservations";
import { appendNote, decideItemMerge, decideShippingUpdate, differentAddressNote, duplicateNote } from "./merge-policy";
import { sendOrderConfirmation } from "@/lib/whatsapp";
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
  const data = insertOrderSchema.parse(input);
  const snapshot = JSON.stringify({ ...data, productId });
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
    const productIds = [...new Set([productId, ...(canMerge && recent ? recent.orderitems.map(item => item.productId) : [])])].sort();
    for (const id of productIds) await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id}::uuid FOR UPDATE`;
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product || product.isArchived || product.slug === "unlinked-ad-spend") throw new Error("المنتج غير متاح");
    if (product.colors.length && (!data.selectedColor || !product.colors.includes(data.selectedColor)))
      throw new Error("اختر لوناً من ألوان المنتج المتاحة");
    const actualShippingCost = async () => {
      const settings = await tx.shippingSettings.upsert({ where: { id: "default" }, create: { id: "default", baghdadCost: 4, othersCost: 5 }, update: {} });
      return Number(data.governorate === "Baghdad" ? settings.baghdadCost : settings.othersCost);
    };
    const pricing = computeOrderPricing({ quantity: data.quantity, unitPrice: Number(product.price), shippingPrice: Number(product.shippingPrice), offers: product.offers });
    const itemData = {
      productId: product.id, slug: product.slug, name: product.name, qty: data.quantity,
      image: product.images[0] || "/placeholder.jpg", price: product.price, costPrice: product.costPrice,
      offersSnapshot: product.offers, lineTotal: pricing.itemsPrice, selectedColor: data.selectedColor,
      shippingPrice: product.shippingPrice,
    };
    let orderId: string;
    let kind: "created" | "merged" | "duplicate";
    if (recent && canMerge) {
      const decision = decideItemMerge(recent.orderitems.find(item => item.productId === product.id)?.qty, data.quantity);
      const shipping = decideShippingUpdate(recent, data);
      let notes = recent.notes;
      kind = decision.kind === "duplicate" ? "duplicate" : "merged";
      if (kind === "duplicate") notes = appendNote(notes, duplicateNote(product.name, data.quantity));
      if (shipping.kind === "keep") notes = appendNote(notes, differentAddressNote(shipping.incoming));
      if (decision.kind === "append") await tx.orderItem.create({ data: { ...itemData, orderId: recent.id } });
      const items = await tx.orderItem.findMany({ where: { orderId: recent.id } });
      const products = await tx.product.findMany({ where: { id: { in: items.map(item => item.productId) } }, select: { id: true, offers: true } });
      const itemsPrice = computeItemsPriceTotal(items.map(item => ({ productId: item.productId, unitPrice: Number(item.price), quantity: item.qty })), new Map(products.map(p => [p.id, p.offers])));
      const shippingPrice = items.length ? Math.max(...items.map(item => Number(item.shippingPrice))) : 0;
      await tx.order.update({ where: { id: recent.id }, data: {
        totalPrice: itemsPrice + shippingPrice, shippingPrice, quantity: items.reduce((sum, item) => sum + item.qty, 0), notes,
        ...(shipping.kind === "update" ? { fullName: data.fullName, governorate: data.governorate, address: data.address, actualShippingCost: await actualShippingCost() } : {}),
        // A staff-assisted order belongs to the customer; never reassign it to the operator.
        ...(options.userId ? { userId: options.userId } : {}),
      } });
      orderId = recent.id;
    } else {
      const { selectedColor: _color, ...shippingData } = data;
      void _color;
      const order = await tx.order.create({ data: {
        ...shippingData, totalPrice: pricing.totalPrice, shippingPrice: pricing.shippingPrice,
        status: options.banned ? "banned" : "home", actualShippingCost: await actualShippingCost(),
        userId: options.userId, ip: options.ip,
      } });
      orderId = order.id; kind = "created";
      await tx.orderItem.create({ data: { ...itemData, orderId } });
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
