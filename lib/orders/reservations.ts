import { prisma } from "@/db/prisma";
import { STOCK_CONSUMED_STATUSES } from "@/lib/constants/order-statuses";
type Transaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Product locks serialize competing checkouts; the check and reservation commit together. */
export async function reserveOrderStock(tx: Transaction, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderitems: true } });
  if (order.status !== "home") return;
  for (const item of [...order.orderitems].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${item.productId}::uuid FOR UPDATE`;
    const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { stock: true, isArchived: true } });
    const occupied = await tx.orderItem.aggregate({ where: { productId: item.productId, orderId: { not: orderId }, order: { OR: [{ status: { in: STOCK_CONSUMED_STATUSES } }, { status: "home", reservationExpiresAt: { gt: new Date() } }] } }, _sum: { qty: true } });
    if (product.isArchived || item.qty < 1 || item.qty > product.stock - (occupied._sum.qty ?? 0)) throw new Error(`الكمية المطلوبة لم تعد متاحة: ${item.name}`);
  }
  await tx.order.update({ where: { id: orderId }, data: { reservationExpiresAt: new Date(Date.now() + 18 * 3600000) } });
}
