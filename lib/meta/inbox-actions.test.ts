import { checkSocialInboxConnection, getSocialInboxSetup, getSocialInboxList, getSocialInboxDetail, getSocialInboxOrigin, getSocialInboxDelivery, replyToSocialInbox, sendSocialInboxMedia, getSocialInboxUploadScope, markSocialInboxRead, searchSocialInboxProducts, searchSocialInboxOrdersByPhone, prepareSocialInboxOrder, approveSocialInboxOrder } from "../actions/social-inbox.actions";
import { submitQuickOrder } from "../orders/quick-order";
import { signInboxMedia } from "./inbox-media-ticket";
import { getAvailableStocks } from "../inventory";
import { requireAdministrator } from "../authorization";
import { prisma } from "@/db/prisma";
import { graphGet, graphPost, GraphError } from "./graph";
import { resourceHandle } from "./inbox";

jest.mock("../orders/quick-order", () => ({ submitQuickOrder: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("../utils", () => ({ formatNumberWithDecimal: (value: number) => value.toFixed(2), convertArabicToEnglishNumbers: (value: string) => value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)) }));

jest.mock("../authorization", () => ({ requireAdministrator: jest.fn() }));
jest.mock("@/db/prisma", () => ({ prisma: { metaConnection: { findUnique: jest.fn() },
  product: { findMany: jest.fn() },
  order: { findMany: jest.fn() },
  socialPost: { findFirst: jest.fn() },
  socialInboxOrder: { findMany: jest.fn() },
  socialInboxState: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } } }));
jest.mock("../inventory", () => ({ getAvailableStocks: jest.fn() }));
jest.mock("./inbox-delivery-storage", () => ({ applyInboxDelivery: async (_ctx: unknown, _recipient: unknown, items: unknown) => items }));
jest.mock("@/lib/constants", () => ({ SERVER_URL: "https://store.example", iraqGovernorates: ["Baghdad"] }));
jest.mock("./config", () => ({ getMetaConfig: () => ({ appId: "123", appSecret: "secret" }) }));
jest.mock("./graph", () => ({ graphGet: jest.fn(), graphPost: jest.fn(), GraphError: class extends Error {} }));
const admin = jest.mocked(requireAdministrator);
const find = jest.mocked(prisma.metaConnection.findUnique);
beforeEach(() => {
  jest.resetAllMocks();
  admin.mockResolvedValue({ user: { id: "admin1", role: "admin" } } as Awaited<ReturnType<typeof requireAdministrator>>);
  find.mockResolvedValue({ userAccessToken: "PRIVATE_USER", pages: [{ id: "page1", name: "Page", access_token: "PRIVATE_PAGE" }] } as never);
  jest.mocked(prisma.socialInboxState.findMany).mockResolvedValue([]);
  jest.mocked(prisma.socialInboxOrder.findMany).mockResolvedValue([]);
  jest.mocked(prisma.socialPost.findFirst).mockResolvedValue(null);
});

it("authorizes a connection health check before reading any credentials", async () => {
  admin.mockRejectedValueOnce(new Error("غير مصرح"));
  expect((await checkSocialInboxConnection({ pageId: "page1", platform: "facebook" })).ok).toBe(false);
  expect(find).not.toHaveBeenCalled(); expect(graphGet).not.toHaveBeenCalled();
});
it("refuses health checks for an unapproved Page before calling Graph", async () => {
  expect((await checkSocialInboxConnection({ pageId: "otherPage", platform: "facebook" })).ok).toBe(false);
  expect(graphGet).not.toHaveBeenCalled(); expect(graphPost).not.toHaveBeenCalled();
});
it("checks the requested Page token and logs a safe fingerprint without sending or altering credentials", async () => {
  jest.mocked(graphGet).mockResolvedValueOnce({ data: { is_valid: true, app_id: "123", type: "PAGE", profile_id: "page1", scopes: ["pages_messaging"] } })
    .mockResolvedValueOnce({ id: "page1" }).mockResolvedValueOnce({ data: [{ permission: "pages_messaging", status: "granted" }] });
  const log = jest.spyOn(console, "info").mockImplementation(() => {});
  try {
    const result = await checkSocialInboxConnection({ pageId: "page1", platform: "facebook" });
    expect(result).toMatchObject({ ok: true, data: { status: "healthy" } });
    expect(graphGet).toHaveBeenCalledWith("me", "PRIVATE_PAGE", { fields: "id" }, expect.anything());
    expect(graphPost).not.toHaveBeenCalled();
    expect(JSON.stringify([result, log.mock.calls])).not.toContain("PRIVATE");
  } finally { log.mockRestore(); }
});

describe("comment private-reply receipts", () => {
  function source() {
    const at = Date.now() - 3600000;
    jest.mocked(graphGet).mockResolvedValueOnce({ data: [
      { id: "copy", from: { id: "customer" }, message: "السعر؟", created_time: new Date(at + 2000).toISOString() },
      { id: "notice", from: { id: "customer" }, created_time: new Date(at).toISOString(),
        message: "Facebook created this chat because Customer commented on your post. See comment(https://facebook.com/story.php?comment_id=123)" },
    ] }).mockResolvedValueOnce({ id: "post1_123", message: "السعر؟", created_time: new Date(at - 6000).toISOString(),
      object: { id: "post1" }, can_reply_privately: true })
      .mockResolvedValueOnce({ id: "post1", from: { id: "page1" }, message: "Product" });
    const ctx = { pageId: "page1", platform: "facebook" as const, token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" };
    return { pageId: "page1", platform: "facebook" as const, kind: "messages" as const,
      handle: resourceHandle(ctx, "conversation", "thread1"), text: "Reply" };
  }
  it("blocks a repeated private reply when Meta history still lags behind the saved confirmation", async () => {
    const input = source();
    jest.mocked(prisma.socialInboxState.findUnique).mockResolvedValue({ lastReplyMessageId: "sent1", previousMessageIds: ["copy", "notice"] } as never);
    expect(await replyToSocialInbox(input)).toMatchObject({ ok: false, message: expect.stringContaining("سبق إرسال") });
    expect(graphPost).not.toHaveBeenCalled(); expect(prisma.socialInboxState.upsert).not.toHaveBeenCalled();
  });
  it("closes a stale private-reply window on detail reload using the confirmed receipt", async () => {
    const input = source();
    jest.mocked(prisma.socialInboxState.findUnique).mockResolvedValue({ lastReplyMessageId: "sent1", previousMessageIds: ["copy", "notice"] } as never);
    expect(await getSocialInboxDetail(input)).toMatchObject({ ok: true, data: { window: { canReply: false, reason: "private-reply-sent" } } });
    expect(graphPost).not.toHaveBeenCalled();
  });
  it("keeps a confirmed private send successful even if storing its receipt fails", async () => {
    const input = source();
    jest.mocked(graphPost).mockResolvedValue({ message_id: "sent1" });
    jest.mocked(prisma.socialInboxState.upsert).mockRejectedValueOnce(new Error("Database unavailable"));
    expect(await replyToSocialInbox(input)).toMatchObject({ ok: true, data: { id: "sent1", stateSaved: false, replyMode: "private-reply" } });
    expect(graphPost).toHaveBeenCalledTimes(1);
  });
});

it("rejects order phone lookup by a revoked operator before any database query", async () => {
  admin.mockRejectedValueOnce(new Error("غير مصرح"));
  expect((await searchSocialInboxOrdersByPhone("07701234567")).ok).toBe(false);
  expect(prisma.order.findMany).not.toHaveBeenCalled();
});
it.each(["123", "07701234567 07801234567", "x".repeat(51)])("rejects an incomplete/ambiguous phone search before a database query: %s", async phone => {
  expect((await searchSocialInboxOrdersByPhone(phone)).ok).toBe(false);
  expect(prisma.order.findMany).not.toHaveBeenCalled();
});
it("searches the complete normalized number across statuses, includes archived records and returns a bounded serialized result", async () => {
  jest.mocked(prisma.order.findMany).mockResolvedValue(Array.from({ length: 11 }, (_, i) => ({
    id: `order${i}`, status: i ? "completed" : "pending", createdAt: new Date("2026-10-25T08:00:00Z"),
    totalPrice: "35.00", phoneNumber: "07701234567", deliveryTrackingId: i ? null : "QR-123456", governorate: "Baghdad", isArchived: i === 1, orderitems: [{ name: "منتج", qty: 1 }],
  })) as never);
  const result = await searchSocialInboxOrdersByPhone("٠٠٩٦٤ ٧٧٠ ١٢٣ ٤٥٦٧");
  expect(result).toMatchObject({ ok: true, data: { phoneNumber: "07701234567", hasMore: true } });
  if (result.ok) {
    expect(result.data.orders).toHaveLength(10);
    expect(result.data.orders[0]).toMatchObject({ status: "pending", phoneNumber: "07701234567", deliveryTrackingId: "QR-123456", totalPrice: 35, createdAt: "2026-10-25T08:00:00.000Z" });
    expect(result.data.orders[1].deliveryTrackingId).toBeNull();
    expect(result.data.orders[1].isArchived).toBe(true);
  }
  expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { phoneNumber: { in: ["07701234567", "+9647701234567", "9647701234567", "009647701234567", "7701234567"] } },
    take: 11, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: expect.objectContaining({ phoneNumber: true, deliveryTrackingId: true }),
  }));
  expect(graphGet).not.toHaveBeenCalled(); expect(graphPost).not.toHaveBeenCalled();
});

it("reports 551 without claiming a customer block, logs only diagnostic codes, and saves no sent receipt", async () => {
  const ctx = { pageId: "page1", platform: "facebook" as const, token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" };
  jest.mocked(graphGet).mockResolvedValue({ data: [{ id: "m1", from: { id: "customer" }, created_time: new Date().toISOString() }] });
  jest.mocked(graphPost).mockRejectedValue(Object.assign(new GraphError(400, "PRIVATE_META_MESSAGE", 551), {
    status: 400, code: 551, subcode: 1545041, traceId: "trace-for-support",
  }));
  const log = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const result = await replyToSocialInbox({ pageId: "page1", platform: "facebook", kind: "messages",
      handle: resourceHandle(ctx, "conversation", "thread1"), text: "PRIVATE_CUSTOMER_REPLY" });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("551/1545041") });
    expect(result).toMatchObject({ uncertain: false, message: expect.stringContaining("Meta Business Suite") });
    expect(result).toMatchObject({ message: expect.stringContaining("مرجع دعم Meta: trace-for-support") });
    expect(result).toMatchObject({ message: expect.stringContaining("وضع التطبيق") });
    expect(prisma.socialInboxState.upsert).not.toHaveBeenCalled();
    expect(graphPost).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[social-inbox] Meta rejected request", {
      status: 400, code: 551, subcode: 1545041, traceId: "trace-for-support",
    });
    expect(log).toHaveBeenCalledWith("[social-inbox] Send failed", expect.objectContaining({
      pageId: "page1", platform: "facebook", appId: "123", tokenFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
      code: 551, traceId: "trace-for-support",
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  } finally { log.mockRestore(); }
});

it("requires a fresh administrator and a scoped conversation for delivery polling", async () => {
  admin.mockRejectedValueOnce(new Error("Revoked"));
  expect((await getSocialInboxDelivery({ pageId: "page1", platform: "facebook", handle: "forged" })).ok).toBe(false);
  expect(graphGet).not.toHaveBeenCalled();
  expect((await getSocialInboxDelivery({ pageId: "page1", platform: "facebook", handle: "forged" })).ok).toBe(false);
  expect(graphGet).not.toHaveBeenCalled();
});

it("enriches a verified source post from its explicit published product relationship", async () => {
  const ctx = { pageId: "page1", platform: "facebook" as const, token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" };
  jest.mocked(graphGet).mockResolvedValueOnce({ data: [{ id: "notice", message: "أنشأ فيسبوك هذه الدردشة بالتعليق على منشورك. عرض التعليق(https://facebook.com/story.php?comment_id=123)", from: { id: "customer" } }] })
    .mockResolvedValueOnce({ id: "123", message: "السعر؟", object: { id: "page1_456" } })
    .mockResolvedValueOnce({ id: "page1_456", message: "Product caption", from: { id: "page1" } });
  jest.mocked(prisma.socialPost.findFirst).mockResolvedValue({ productId: "p1" } as never);
  jest.mocked(prisma.product.findMany).mockResolvedValue([{ id: "p1", name: "منتج", slug: "product", images: [], price: "30", shippingPrice: "5", stock: 20, colors: [], offers: null }] as never);
  jest.mocked(getAvailableStocks).mockResolvedValue(new Map([["p1", 7]]));
  const result = await getSocialInboxOrigin({ pageId: "page1", platform: "facebook", handle: resourceHandle(ctx, "conversation", "thread1") });
  expect(result.ok && result.data?.products?.[0]).toMatchObject({ id: "p1", name: "منتج", available: 7 });
  expect(prisma.socialPost.findFirst).toHaveBeenCalledWith({ where: { fbPostId: "page1_456" }, select: { productId: true } });
  expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(graphPost).not.toHaveBeenCalled();
});

it("blocks source lookup before Graph/DB reads for an unauthorized page", async () => {
  expect((await getSocialInboxOrigin({ pageId: "other-page", platform: "facebook", handle: "forged" })).ok).toBe(false);
  expect(graphGet).not.toHaveBeenCalled(); expect(prisma.socialPost.findFirst).not.toHaveBeenCalled();
});

it("blocks order preparation and approval for a revoked operator", async () => {
  admin.mockRejectedValue(new Error("غير مصرح"));
  expect((await prepareSocialInboxOrder({ pageId: "page1", platform: "facebook", handle: "bad" })).ok).toBe(false);
  expect((await approveSocialInboxOrder({ pageId: "page1", platform: "facebook", handle: "bad" } as never)).ok).toBe(false);
  expect(submitQuickOrder).not.toHaveBeenCalled(); expect(graphGet).not.toHaveBeenCalled();
});

it("uses the shared checkout with a fixed name and scoped durable approval receipt", async () => {
  jest.mocked(submitQuickOrder).mockResolvedValue({ orderId: "order1", kind: "created", replay: false });
  const handle = resourceHandle({ pageId: "page1", platform: "facebook", token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" }, "conversation", "thread1");
  const input = { pageId: "page1", platform: "facebook" as const, handle, requestId: "11111111-1111-4111-8111-111111111111", productId: "22222222-2222-4222-8222-222222222222",
    fullName: "Untrusted customer name", phoneNumber: "+9647701234567", governorate: "Baghdad", address: "  عنوان تفصيلي  ", quantity: 2 };
  expect((await approveSocialInboxOrder(input)).ok).toBe(true);
  expect(submitQuickOrder).toHaveBeenCalledWith(expect.objectContaining({ fullName: "زبون", phoneNumber: "07701234567", address: "عنوان تفصيلي", quantity: 2 }), input.productId,
    expect.objectContaining({ receipt: expect.objectContaining({ pageId: "page1", platform: "facebook", conversationId: "thread1", createdBy: "admin1" }) }));
  const firstKey = jest.mocked(submitQuickOrder).mock.calls[0][2].receipt?.requestKey;
  await approveSocialInboxOrder(input);
  expect(jest.mocked(submitQuickOrder).mock.calls[1][2].receipt?.requestKey).toBe(firstKey);
  expect(graphPost).not.toHaveBeenCalled();
});

it("rejects incomplete orders and cross-Page handles before checkout", async () => {
  const ctx = { pageId: "page1", platform: "facebook" as const, token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" };
  const input = { pageId: "page1", platform: "facebook" as const, handle: resourceHandle(ctx, "conversation", "thread1"),
    requestId: "11111111-1111-4111-8111-111111111111", productId: "22222222-2222-4222-8222-222222222222", phoneNumber: "07701234567", governorate: "Baghdad", address: "", quantity: 1 };
  expect((await approveSocialInboxOrder(input)).ok).toBe(false);
  expect((await approveSocialInboxOrder({ ...input, address: "عنوان كامل", governorate: "invalid" })).ok).toBe(false);
  expect((await approveSocialInboxOrder({ ...input, address: "عنوان كامل", handle: resourceHandle({ ...ctx, pageId: "other" }, "conversation", "thread1") })).ok).toBe(false);
  expect(submitQuickOrder).not.toHaveBeenCalled();
});

it("authorizes attachment upload and sending with a fresh administrator check", async () => {
  admin.mockRejectedValue(new Error("غير مصرح"));
  await expect(getSocialInboxUploadScope({ pageId: "page1", platform: "facebook", handle: "bad" })).rejects.toThrow();
  expect((await sendSocialInboxMedia({ pageId: "page1", platform: "facebook", handle: "bad", ticket: "bad" })).ok).toBe(false);
  expect(find).not.toHaveBeenCalled(); expect(graphPost).not.toHaveBeenCalled();
});
it("rejects a cross-conversation upload receipt before any Graph read or write", async () => {
  const ctx = { pageId: "page1", platform: "facebook" as const, token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" };
  const ticket = signInboxMedia({ ...ctx, conversationId: "other-thread" }, { kind: "image", url: "https://demo.ufs.sh/f/image", name: "image.jpg", size: 100 }, "secret");
  expect((await sendSocialInboxMedia({ pageId: "page1", platform: "facebook", handle: resourceHandle(ctx, "conversation", "thread1"), ticket })).ok).toBe(false);
  expect(graphGet).not.toHaveBeenCalled(); expect(graphPost).not.toHaveBeenCalled();
});
it("does not turn a confirmed media send into a retryable failure when receipt storage fails", async () => {
  const ctx = { pageId: "page1", platform: "facebook" as const, token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" };
  const scope = { userId: "admin1", pageId: "page1", platform: "facebook" as const, conversationId: "thread1" };
  const media = { kind: "video" as const, url: "https://demo.ufs.sh/f/video", name: "video.mp4", size: 100 };
  const ticket = signInboxMedia(scope, media, "secret");
  jest.mocked(graphGet).mockResolvedValue({ data: [{ id: "incoming", from: { id: "customer" }, created_time: new Date(Date.now() - 1000).toISOString() }] });
  jest.mocked(graphPost).mockResolvedValue({ message_id: "sent-media" });
  jest.mocked(prisma.socialInboxState.upsert).mockRejectedValue(new Error("DB unavailable"));
  expect(await sendSocialInboxMedia({ pageId: "page1", platform: "facebook", handle: resourceHandle(ctx, "conversation", "thread1"), ticket }))
    .toEqual({ ok: true, data: { id: "sent-media", stateSaved: false, media, previousMessageIds: ["incoming"] } });
  expect(graphPost).toHaveBeenCalledTimes(1);
});

it("blocks unauthorized users before loading assets or writing to Meta", async () => {
  admin.mockRejectedValue(new Error("غير مصرح"));
  const result = await replyToSocialInbox({ pageId: "page1", platform: "facebook", kind: "messages", handle: "bad", text: "hello" });
  expect(result.ok).toBe(false);
  expect(find).not.toHaveBeenCalled();
  expect(graphPost).not.toHaveBeenCalled();
});
it("authorizes product lookup before reading private inventory", async () => {
  admin.mockRejectedValue(new Error("غير مصرح"));
  expect((await searchSocialInboxProducts("منتج", "ar")).ok).toBe(false);
  expect(prisma.product.findMany).not.toHaveBeenCalled();
});
it("uses the shared available inventory calculation and excludes internal and archived products", async () => {
  jest.mocked(prisma.product.findMany).mockResolvedValue([{ id: "p1", slug: "example", name: "منتج", price: "18", shippingPrice: "4", images: [], stock: 100 }] as never);
  jest.mocked(getAvailableStocks).mockResolvedValue(new Map([["p1", 7]]));
  const result = await searchSocialInboxProducts("منتج", "ar");
  expect(result.ok && result.data[0]).toMatchObject({ price: 18, shippingPrice: 4, available: 7, image: null });
  expect(getAvailableStocks).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "p1", stock: 100 })]));
  expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20, where: expect.objectContaining({ isArchived: false, slug: { not: "unlinked-ad-spend" } }) }));
});
it("rejects pages outside the authorized connection before accessing Graph", async () => {
  expect((await getSocialInboxList({ pageId: "other-page", platform: "facebook", kind: "messages" })).ok).toBe(false);
  expect(graphGet).not.toHaveBeenCalled();
  expect(graphPost).not.toHaveBeenCalled();
});
it("never returns page or user tokens in inbox setup", async () => {
  const result = await getSocialInboxSetup();
  expect(result.pages).toEqual([{ id: "page1", name: "Page", igId: null, igUsername: null }]);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

it("blocks read receipts for unauthorized administrators before any external write", async () => {
  admin.mockRejectedValue(new Error("غير مصرح"));
  expect((await markSocialInboxRead({ pageId: "page1", platform: "facebook", handle: "bad", messageId: "m1" })).ok).toBe(false);
  expect(find).not.toHaveBeenCalled();
  expect(graphPost).not.toHaveBeenCalled();
});

it("reports a successful send even if storing its follow-up receipt fails", async () => {
  jest.mocked(graphGet).mockResolvedValue({ data: [{ id: "incoming", from: { id: "customer" }, created_time: new Date(Date.now() - 1000).toISOString() }] });
  jest.mocked(graphPost).mockResolvedValue({ message_id: "sent1" });
  jest.mocked(prisma.socialInboxState.upsert).mockRejectedValue(new Error("Database unavailable"));
  const handle = resourceHandle({ pageId: "page1", platform: "facebook", token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" }, "conversation", "thread1");
  expect(await replyToSocialInbox({ pageId: "page1", platform: "facebook", kind: "messages", handle, text: "reply" }))
    .toEqual({ ok: true, data: { id: "sent1", stateSaved: false, previousMessageIds: ["incoming"] } });
  expect(graphPost).toHaveBeenCalledTimes(1);
});

it.each(["وعليكم السلام ورحمة الله وبركاته", "أهلاً وسهلاً، نورتنا", "للحجز يرجى كتابة رقم الهاتف والمحافظة والعنوان"])("sends a general text reply without any product lookup: %s", async text => {
  jest.mocked(graphGet).mockResolvedValue({ data: [{ id: "incoming", from: { id: "customer" }, created_time: new Date(Date.now() - 1000).toISOString() }] });
  jest.mocked(graphPost).mockResolvedValue({ message_id: "sent-general" });
  const handle = resourceHandle({ pageId: "page1", platform: "facebook", token: "PRIVATE_PAGE", secret: "secret", userId: "admin1" }, "conversation", "thread1");
  expect(await replyToSocialInbox({ pageId: "page1", platform: "facebook", kind: "messages", handle, text }))
    .toEqual({ ok: true, data: { id: "sent-general", stateSaved: true, previousMessageIds: ["incoming"] } });
  expect(graphPost).toHaveBeenCalledWith("page1/messages", "PRIVATE_PAGE", expect.objectContaining({ message: { text } }));
  expect(prisma.product.findMany).not.toHaveBeenCalled();
  expect(getAvailableStocks).not.toHaveBeenCalled();
});
