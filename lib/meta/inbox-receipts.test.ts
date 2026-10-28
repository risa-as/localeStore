import { prisma } from "@/db/prisma";
import { applyInboxReceipts, saveInboxRead, saveInboxReply, hasInboxReplyForOrigin } from "./inbox-receipts";
import type { InboxPage } from "./inbox";

jest.mock("@/db/prisma", () => ({ prisma: { socialInboxState: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } } }));
const ctx = { pageId: "page1", platform: "facebook" as const };
const page: InboxPage = { items: [{ id: "thread1", handle: "handle", title: "Customer", text: "Question",
  time: "2026-10-23T10:00:00Z", outgoing: false, unread: 1, lastMessageId: "incoming1" }], after: null };
beforeEach(() => jest.resetAllMocks());

it("consumes only a notice included in a confirmed send's snapshot, under the same Page/platform/thread", async () => {
  jest.mocked(prisma.socialInboxState.findUnique).mockResolvedValue({ lastReplyMessageId: "sent1", previousMessageIds: ["notice"] } as never);
  expect(await hasInboxReplyForOrigin(ctx, "thread1", "notice")).toBe(true);
  expect(await hasInboxReplyForOrigin(ctx, "thread1", "different-notice")).toBe(false);
  expect(prisma.socialInboxState.findUnique).toHaveBeenCalledWith({
    where: { pageId_platform_conversationId: { ...ctx, conversationId: "thread1" } },
    select: { lastReplyMessageId: true, previousMessageIds: true },
  });
  jest.mocked(prisma.socialInboxState.findUnique).mockResolvedValue({ lastReplyMessageId: null, previousMessageIds: ["notice"] } as never);
  expect(await hasInboxReplyForOrigin(ctx, "thread1", "notice")).toBe(false);
});

it("restores read and replied state from the database on a fresh page load", async () => {
  jest.mocked(prisma.socialInboxState.findMany).mockResolvedValue([{ conversationId: "thread1",
    lastReadMessageId: "sent1", lastReplyMessageId: "sent1", lastReplyText: "Reply", lastReplyAt: new Date("2026-10-23T10:01:00Z"),
    previousMessageIds: ["incoming1"] }] as never);
  expect((await applyInboxReceipts(ctx, page)).items[0]).toMatchObject({ unread: 0, outgoing: true, text: "Reply", lastMessageId: "sent1" });
  const newPage = { ...page, items: [{ ...page.items[0], lastMessageId: "new-customer-message" }] };
  expect((await applyInboxReceipts(ctx, newPage)).items[0]).toMatchObject({ unread: 1, outgoing: false });
  expect(prisma.socialInboxState.findMany).toHaveBeenCalledWith({ where: { pageId: "page1", platform: "facebook", conversationId: { in: ["thread1"] } } });
});
it("saves read and sent receipts under the Page/platform/conversation key", async () => {
  await saveInboxRead(ctx, "thread1", "incoming1");
  expect(prisma.socialInboxState.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
    where: { pageId_platform_conversationId: { ...ctx, conversationId: "thread1" } }, update: { lastReadMessageId: "incoming1" },
  }));
  await saveInboxReply(ctx, "thread1", { id: "sent1", previousMessageIds: ["incoming1"] }, "Reply");
  expect(prisma.socialInboxState.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
    update: expect.objectContaining({ lastReadMessageId: "sent1", lastReplyMessageId: "sent1", lastReplyText: "Reply" }),
  }));
});
