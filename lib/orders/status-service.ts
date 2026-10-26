import { prisma } from "@/db/prisma";
import { REVENUE_STATUSES } from "@/lib/constants/order-statuses";
import { reserveOrderStock } from "./reservations";
import { RETURN_INQUIRY_STATUSES } from "./return-inquiry";

const dispatched = ["pending", "failed", "rescheduled", "returned", ...REVENUE_STATUSES];
const allowed = ["home", "waiting", "unavailable", "banned", "delete", "returnReceived", ...dispatched];

/** Run inside the transaction that saves the order. Costs are written once per dispatch. */
type OrderTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
export async function transitionOrder(tx: OrderTransaction, orderId: string, status: string, source: string) {
  if (!allowed.includes(status)) throw new Error("حالة طلب غير صالحة");
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderitems: true } });
  if (order.status === status) return false;
  if (order.inventoryDispatchedAt && !order.inventoryReturnedAt && ["home", "delete", "banned", "unavailable", "waiting"].includes(status)) {
    throw new Error("استلم الراجع في المخزن قبل إعادة الطلب أو إلغائه");
  }
  if (dispatched.includes(status) && (!order.inventoryDispatchedAt || order.inventoryReturnedAt)) {
    if (order.orderitems.length === 0) throw new Error("الطلب بلا منتجات");
    const now = new Date();
    for (const item of [...order.orderitems].sort((a, b) => a.productId.localeCompare(b.productId))) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${item.productId}::uuid FOR UPDATE`;
      const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { stock: true } });
      const occupied = await tx.orderItem.aggregate({ where: { productId: item.productId, orderId: { not: orderId }, order: { OR: [{ status: { in: dispatched } }, { status: "home", reservationExpiresAt: { gt: new Date() } }] } }, _sum: { qty: true } });
      if (item.qty <= 0 || item.qty > product.stock - (occupied._sum.qty ?? 0)) throw new Error(`المخزون غير كافٍ: ${item.name}`);
      const batches = await tx.productBatch.findMany({ where: { productId: item.productId, createdAt: { lte: now } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const allocations = await tx.inventoryAllocation.findMany({ where: { productId: item.productId, returnedAt: null } });
      const consumed = new Map<string, number>();
      for (const allocation of allocations) if (allocation.batchId) consumed.set(allocation.batchId, (consumed.get(allocation.batchId) ?? 0) + allocation.quantity);
      let need = item.qty;
      let cost = 0;
      for (const batch of batches) {
        const take = Math.min(need, Math.max(0, batch.quantity - (consumed.get(batch.id) ?? 0)));
        if (!take) continue;
        await tx.inventoryAllocation.create({ data: { orderId, productId: item.productId, batchId: batch.id, quantity: take, unitCost: batch.costPrice } });
        cost += take * Number(batch.costPrice);
        need -= take;
        if (!need) break;
      }
      if (need) {
        await tx.inventoryAllocation.create({ data: { orderId, productId: item.productId, quantity: need, unitCost: item.costPrice } });
        cost += need * Number(item.costPrice);
      }
      await tx.orderItem.update({ where: { orderId_productId: { orderId, productId: item.productId } }, data: { costTotal: cost, costSource: "dispatch" } });
    }
    await tx.order.update({ where: { id: orderId }, data: { inventoryDispatchedAt: now, inventoryReturnedAt: null } });
  }
  if (status === "returnReceived") {
    await tx.inventoryAllocation.updateMany({ where: { orderId, returnedAt: null }, data: { returnedAt: new Date() } });
  }
  const event = await tx.orderStatusEvent.create({ data: { orderId, fromStatus: order.status, toStatus: status, source } });
  const complete = REVENUE_STATUSES.includes(status);
  await tx.order.update({ where: { id: orderId }, data: {
    status,
    reservationExpiresAt: null,
    isDelivered: complete,
    // isPaid means the customer paid; courier settlement is a separate concept.
    ...(complete ? { isPaid: true, paidAt: order.paidAt ?? new Date() } : {}),
    ...(["returned", "returnReceived"].includes(status) ? { isPaid: false, paidAt: null } : {}),
    ...(complete && !order.deliveredAt ? { deliveredAt: new Date() } : {}),
    ...(status === "returnReceived" ? { inventoryReturnedAt: new Date() } : {}),
  } });
  if (status === "home") await reserveOrderStock(tx, orderId);
  if (complete) await tx.storeEvent.createMany({ data: [{ name: "order_delivered", orderId, sessionId: orderId, eventKey: `order_delivered:${orderId}` }], skipDuplicates: true });
  // A single return inquiry per order, regardless of bulk/sync/repeated toggles.
  if (RETURN_INQUIRY_STATUSES.includes(status)) {
    await tx.messageOutbox.upsert({ where: { eventKey: `return-inquiry:${orderId}` }, update: {}, create: {
      orderId, eventKey: `return-inquiry:${orderId}`, template: "order_returned",
      payload: { fullName: order.fullName, phoneNumber: order.phoneNumber, product: order.orderitems.map(i => `${i.name} × ${i.qty}`).join(" + "), price: order.totalPrice.toString(), statusEventId: event.id },
    } });
  }
  return true;
}

export async function setOrderStatus(orderId: string, status: string, source: string) {
  return prisma.$transaction(tx => transitionOrder(tx, orderId, status, source), { timeout: 30000 });
}
