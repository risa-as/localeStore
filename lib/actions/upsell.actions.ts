"use server";
import { prisma } from "@/db/prisma";
import { assertOrderAccess } from "@/lib/orders/access";
import { reserveOrderStock } from "@/lib/orders/reservations";
import { getAvailableStock } from "@/lib/inventory";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { recordOrderEvent } from "@/lib/orders/telemetry";

export async function getOrderReceipt(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: z.string().uuid().parse(orderId) }, include: { orderitems: true } });
  await assertOrderAccess(order);
  return { orderNo: order.id.slice(0, 8).toUpperCase(), status: order.status, totalPrice: Number(order.totalPrice) * 1000, shippingPrice: Number(order.shippingPrice) * 1000, items: order.orderitems.map(item => ({ name: item.name, qty: item.qty })) };
}

export async function getOrderSuggestions(orderId: string) {
  z.string().uuid().parse(orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { orderitems: { include: { product: { select: { relatedProductIds: true } } } } } });
  await assertOrderAccess(order);
  if (!order || order.status !== "home") return [];
  const existing = new Set(order.orderitems.map(item => item.productId));
  const ids = [...new Set(order.orderitems.flatMap(item => item.product.relatedProductIds))].filter(id => !existing.has(id));
  const products = await prisma.product.findMany({ where: { id: { in: ids }, isArchived: false }, take: 3 });
  const suggestions = [];
  for (const product of products) {
    if (await getAvailableStock(product.id, product.stock) < 1) continue;
    const additionalShipping = Math.max(0, Number(product.shippingPrice) - Number(order.shippingPrice));
    suggestions.push({ id: product.id, name: product.name, image: product.images[0], colors: product.colors, price: Number(product.price), additionalShipping, totalIncrement: Number(product.price) + additionalShipping });
  }
  return suggestions;
}

export async function addProductToExistingOrder(input: { orderId: string; productId: string; color?: string; expectedIncrement: number }) {
  try {
    const data = z.object({ orderId: z.string().uuid(), productId: z.string().uuid(), color: z.string().optional(), expectedIncrement: z.number().finite().nonnegative() }).parse(input);
    await assertOrderAccess(await prisma.order.findUnique({ where: { id: data.orderId }, select: { id: true, userId: true } }));
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${data.orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({ where: { id: data.orderId }, include: { orderitems: { include: { product: { select: { relatedProductIds: true } } } } } });
      if (order.status !== "home") throw new Error("بدأ تجهيز الشحنة؛ تواصل معنا لتعديلها");
      if (order.orderitems.some(item => item.productId === data.productId)) return;
      if (!order.orderitems.some(item => item.product.relatedProductIds.includes(data.productId))) throw new Error("هذا المنتج غير موجود ضمن اقتراحات طلبك");
      const product = await tx.product.findUniqueOrThrow({ where: { id: data.productId } });
      if (product.isArchived) throw new Error("المنتج غير متاح");
      if (product.colors.length && (!data.color || !product.colors.includes(data.color))) throw new Error("اختر لوناً متاحاً");
      const shipping = Math.max(Number(order.shippingPrice), Number(product.shippingPrice));
      const increment = Number(product.price) + shipping - Number(order.shippingPrice);
      if (Math.abs(increment - data.expectedIncrement) > 0.001) throw new Error("تغيّر السعر أو التوصيل؛ راجع الإجمالي المحدّث ثم أعد الإضافة");
      await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, name: product.name, slug: product.slug, image: product.images[0] ?? "/placeholder.jpg", qty: 1, price: product.price, lineTotal: product.price, offersSnapshot: product.offers, costPrice: product.costPrice, shippingPrice: product.shippingPrice, selectedColor: data.color ?? null } });
      await tx.order.update({ where: { id: order.id }, data: { quantity: { increment: 1 }, shippingPrice: shipping, totalPrice: Number(order.totalPrice) + Number(product.price) + shipping - Number(order.shippingPrice) } });
      await reserveOrderStock(tx, order.id);
    });
    revalidatePath("/admin/orders");
    await recordOrderEvent(data.orderId, "upsell_added", data.productId).catch(() => {});
    return { success: true, message: "تمت الإضافة إلى طلبك نفسه" };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "تعذرت الإضافة" }; }
}
