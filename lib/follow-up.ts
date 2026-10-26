import { prisma } from "@/db/prisma";
import { RETURN_INQUIRY_STATUSES } from "@/lib/orders/return-inquiry";
import { WA_UNREAD_CONVERSATIONS } from "@/lib/whatsapp-inbox-filters";

export type FollowUpParams = {
  messages?: string;
  messagePage?: string;
  reasonsPage?: string;
  shipmentsPage?: string;
};
export type MessageFilter = "review" | "pending" | "all";
export const FOLLOW_UP_PAGE_SIZES = { messages: 10, reasons: 10, shipments: 12 };

function pageNumber(value: string | undefined, count: number, size: number) {
  const parsed = Number(value);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  return Math.min(page, Math.max(1, Math.ceil(count / size)));
}

export async function getFollowUpData(params: FollowUpParams) {
  const now = new Date();
  const reasonsWhere = {
    status: { in: RETURN_INQUIRY_STATUSES },
    returnReasonText: { not: null },
    returnReasonCode: null,
  };
  // Elapsed time since dispatch, not time since the last status change.
  const shipmentsWhere = {
    status: { in: ["pending", "failed", "rescheduled", "returned"] },
    deliverySentAt: { lt: new Date(now.getTime() - 5 * 86400000) },
  };
  const [messageCounts, reasonsCount, shipmentsCount, unread] = await Promise.all([
    prisma.messageOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.count({ where: reasonsWhere }),
    prisma.order.count({ where: shipmentsWhere }),
    prisma.waConversation.count({ where: WA_UNREAD_CONVERSATIONS }),
  ]);
  const countStatuses = (statuses?: string[]) => messageCounts.reduce(
    (sum, row) => sum + (!statuses || statuses.includes(row.status) ? row._count._all : 0), 0,
  );
  const needsReview = countStatuses(["review", "failed"]);
  const queued = countStatuses(["queued", "sending"]);
  const messageTotal = countStatuses();
  const messageFilter: MessageFilter = params.messages === "all" || params.messages === "pending"
    ? params.messages : "review";
  const filteredCount = messageFilter === "review" ? needsReview : messageFilter === "pending" ? queued : messageTotal;
  const messagePage = pageNumber(params.messagePage, filteredCount, FOLLOW_UP_PAGE_SIZES.messages);
  const reasonsPage = pageNumber(params.reasonsPage, reasonsCount, FOLLOW_UP_PAGE_SIZES.reasons);
  const shipmentsPage = pageNumber(params.shipmentsPage, shipmentsCount, FOLLOW_UP_PAGE_SIZES.shipments);
  const [outbox, returns, delayed] = await Promise.all([
    prisma.messageOutbox.findMany({
      where: messageFilter === "all" ? {} : { status: { in: messageFilter === "review" ? ["review", "failed"] : ["queued", "sending"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: FOLLOW_UP_PAGE_SIZES.messages, skip: (messagePage - 1) * FOLLOW_UP_PAGE_SIZES.messages,
      include: { order: { select: { id: true, fullName: true, phoneNumber: true, status: true, isArchived: true } } },
    }),
    prisma.order.findMany({
      where: reasonsWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: FOLLOW_UP_PAGE_SIZES.reasons, skip: (reasonsPage - 1) * FOLLOW_UP_PAGE_SIZES.reasons,
      select: { id: true, fullName: true, phoneNumber: true, status: true, isArchived: true, createdAt: true, returnReasonText: true },
    }),
    prisma.order.findMany({
      where: shipmentsWhere, orderBy: [{ deliverySentAt: "asc" }, { id: "asc" }], take: FOLLOW_UP_PAGE_SIZES.shipments, skip: (shipmentsPage - 1) * FOLLOW_UP_PAGE_SIZES.shipments,
      select: { id: true, fullName: true, phoneNumber: true, status: true, isArchived: true, deliverySentAt: true, deliveryTrackingId: true, governorate: true },
    }),
  ]);
  return { now, outbox, returns, delayed, unread, needsReview, queued, messageTotal, reasonsCount, shipmentsCount, filteredCount, messageFilter, messagePage, reasonsPage, shipmentsPage };
}
