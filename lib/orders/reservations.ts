import { prisma } from "@/db/prisma";
type Transaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Holds stock for a `home` order. Running out never rejects the order: the store
 * takes it anyway and the admin orders page flags the product as out of stock
 * (see getStockShortProducts). Only an archived product or a bad quantity fails.
 */
export async function reserveOrderStock(tx: Transaction, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderitems: true } });
  if (order.status !== "home") return;
  for (const item of [...order.orderitems].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${item.productId}::uuid FOR UPDATE`;
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { isArchived: true } });
    if (product.isArchived) throw new Error(`المنتج لم يعد متاحاً: ${item.name}`);
    if (item.qty < 1) throw new Error(`كمية غير صالحة: ${item.name}`);
  }
  await tx.order.update({ where: { id: orderId }, data: { reservationExpiresAt: new Date(Date.now() + 18 * 3600000) } });
}
