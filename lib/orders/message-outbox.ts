import { prisma } from "@/db/prisma";
import { sendOrderReturned } from "@/lib/whatsapp";
import { z } from "zod";

const payloadSchema = z.object({ fullName: z.string(), phoneNumber: z.string(), product: z.string(), price: z.string() });

/** Claims are atomic. Ambiguous network errors require review, avoiding duplicate messages. */
export async function processReturnOutbox(limit = 10) {
  await prisma.messageOutbox.updateMany({ where: { status: "sending", lockedAt: { lt: new Date(Date.now() - 10 * 60000) } }, data: { status: "review", lastError: "انقطع الإرسال؛ تحقّق من المحادثة قبل إعادة المحاولة" } });
  const entries = await prisma.messageOutbox.findMany({ where: { status: "queued", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: Math.min(25, Math.max(1, limit)) });
  let accepted = 0;
  for (const entry of entries) {
    const claim = await prisma.messageOutbox.updateMany({ where: { id: entry.id, status: "queued" }, data: { status: "sending", lockedAt: new Date(), attempts: { increment: 1 } } });
    if (!claim.count) continue;
    try {
      const waMessageId = await sendOrderReturned({ ...payloadSchema.parse(entry.payload), orderId: entry.orderId });
      if (!waMessageId) throw new Error("Meta لم يُرجع معرّف رسالة");
      await prisma.messageOutbox.update({ where: { id: entry.id }, data: { status: "accepted", waMessageId, lockedAt: null, lastError: null } });
      accepted++;
    } catch (error) {
      await prisma.messageOutbox.update({ where: { id: entry.id }, data: { status: "review", lockedAt: null, lastError: error instanceof Error ? error.message : "فشل الإرسال" } });
    }
  }
  return { examined: entries.length, accepted };
}
