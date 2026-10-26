"use server";
import { requireStaff } from "@/lib/authorization";
import { prisma } from "@/db/prisma";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processReturnOutbox } from "@/lib/orders/message-outbox";
import { RETURN_REASONS } from "@/lib/orders/return-reasons";
import { RETURN_INQUIRY_STATUSES } from "@/lib/orders/return-inquiry";
import { z } from "zod";

export async function retryReturnMessage(form: FormData) {
  await requireStaff();
  const id = z.string().min(1).parse(form.get("id"));
  if (form.get("reviewed") !== "on") throw new Error("راجع المحادثة قبل إعادة الإرسال");
  await prisma.messageOutbox.updateMany({ where: { id, status: { in: ["review", "failed"] } }, data: { status: "queued", waMessageId: null, nextAttemptAt: new Date(), lastError: null } });
  after(() => processReturnOutbox().then(() => {}));
  revalidatePath("/[locale]/admin/follow-up", "page");
}

export async function saveReturnReason(form: FormData) {
  await requireStaff();
  const id = z.string().uuid().parse(form.get("id"));
  const reason = z.enum(Object.keys(RETURN_REASONS) as [keyof typeof RETURN_REASONS, ...(keyof typeof RETURN_REASONS)[]]).parse(form.get("reason"));
  await prisma.order.updateMany({ where: { id, status: { in: RETURN_INQUIRY_STATUSES } }, data: { returnReasonCode: reason } });
  revalidatePath("/[locale]/admin/follow-up", "page");
}
