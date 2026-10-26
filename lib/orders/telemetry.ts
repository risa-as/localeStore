import { prisma } from "@/db/prisma";
export async function recordOrderEvent(orderId: string, name: "order_submitted" | "order_delivered" | "upsell_added", productId?: string) {
  await prisma.storeEvent.createMany({ data: [{ orderId, name, productId, sessionId: orderId, eventKey: `${name}:${orderId}:${productId ?? ""}` }], skipDuplicates: true });
}
