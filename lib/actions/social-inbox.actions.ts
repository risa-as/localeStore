"use server";

import { prisma } from "@/db/prisma";
import { requireAdministrator } from "@/lib/authorization";
import { getMetaConfig } from "@/lib/meta/config";
import { GraphError } from "@/lib/meta/graph";
import { listInboxConversations, listInboxPosts, readInboxMessages, readInboxComments,
  sendInboxMessage, sendInboxMediaMessage, sendInboxComment, markInboxConversationRead, readInboxOrigin, resourceId, resourceHandle,
  moderateInboxComment, blockInboxCommentAuthor, replyToComment, readInboxPostText, listPageAdPostIds, readInboxComment,
  type SocialPlatform, type InboxContext } from "@/lib/meta/inbox";
import { verifyInboxMedia } from "@/lib/meta/inbox-media-ticket";
import { applyInboxReceipts, saveInboxRead, saveInboxReply, hasInboxReplyForOrigin } from "@/lib/meta/inbox-receipts";
import { EXCLUDE_INTERNAL_PRODUCTS } from "@/lib/constants/internal-products";
import { getAvailableStocks } from "@/lib/inventory";
import { SERVER_URL } from "@/lib/constants";
import type { InboxProduct } from "@/lib/meta/inbox-tools";
import { createHash } from "node:crypto";
import { z } from "zod";
import { insertOrderSchema } from "@/lib/validators";
import { iraqGovernorates } from "@/lib/constants";
import { extractInboxOrder, digits, SOCIAL_ORDER_NAME } from "@/lib/meta/inbox-order";
import { submitQuickOrder } from "@/lib/orders/quick-order";
import { revalidatePath } from "next/cache";
import { applyInboxDelivery } from "@/lib/meta/inbox-delivery-storage";
import { selectedOrderValue } from "@/lib/meta/inbox-workflow";
import { inspectInboxConnection, inboxTokenFingerprint } from "@/lib/meta/inbox-connection";
import { fillOrderFields, usesOrderFields } from "@/lib/meta/order-reply";

type PageAsset = { id: string; name: string; access_token?: string;
  instagram_business_account?: { id: string; username?: string } };

export async function getSocialInboxSetup() {
  const session = await requireAdministrator();
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  const pages = Array.isArray(conn?.pages) ? conn.pages as unknown as PageAsset[] : [];
  return { userId: session.user.id, configured: !!getMetaConfig(), connected: !!conn?.userAccessToken, selectedPageId: conn?.selectedPageId || null,
    pages: pages.filter(p => p.id && p.access_token).map(p => ({ id: p.id, name: p.name,
      igId: p.instagram_business_account?.id || null, igUsername: p.instagram_business_account?.username || null })) };
}

export async function getSocialInboxOrigin(input: { pageId: string; platform: SocialPlatform; handle: string; messageId?: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (input.messageId !== undefined && (typeof input.messageId !== "string" || !input.messageId || input.messageId.length > 2000)) throw new Error("مرجع الإشعار غير صالح؛ حدّث المحادثة");
    const origin = await readInboxOrigin(ctx, input.handle, input.messageId);
    if (!origin?.post) return origin;
    // Prefer an explicit publishing relationship; never guess a product from similar names.
    const published = await prisma.socialPost.findFirst({ where: { fbPostId: origin.post.id }, select: { productId: true } });
    const storefront = new URL(process.env.SOCIAL_INBOX_STOREFRONT_URL || SERVER_URL);
    const slugs = extractInboxOrder([origin.post]).slugs.filter(link => link.host === storefront.host).map(link => link.slug);
    if (!published?.productId && !slugs.length) return origin;
    const products = await prisma.product.findMany({
      where: { ...EXCLUDE_INTERNAL_PRODUCTS, OR: [...(published?.productId ? [{ id: published.productId }] : []), { slug: { in: slugs } }] },
      select: { id: true, name: true, slug: true, images: true, price: true, shippingPrice: true, stock: true, colors: true, offers: true }, take: 5,
    });
    const available = await getAvailableStocks(products);
    return { ...origin, products: products.map(product => ({ id: product.id, name: product.name, slug: product.slug,
      image: product.images[0] || null, price: Number(product.price), shippingPrice: Number(product.shippingPrice),
      available: available.get(product.id) || 0, colors: product.colors, offers: product.offers,
      url: new URL(`/ar/landing/${encodeURIComponent(product.slug)}`, storefront.origin).toString() })) };
  });
}

export async function searchSocialInboxProducts(query: string, locale: string) {
  return attempt(async (): Promise<InboxProduct[]> => {
    await requireAdministrator();
    if (typeof query !== "string" || query.length > 120) throw new Error("اكتب اسم منتج أقصر للبحث");
    const storefront = new URL(process.env.SOCIAL_INBOX_STOREFRONT_URL || SERVER_URL);
    if (storefront.protocol !== "https:" || /^(localhost|127\.|\[::1\])/i.test(storefront.hostname))
      throw new Error("اضبط SOCIAL_INBOX_STOREFRONT_URL على رابط المتجر المنشور لإدراج روابط صالحة للزبائن");
    const products = await prisma.product.findMany({
      where: { ...EXCLUDE_INTERNAL_PRODUCTS, ...(query.trim() ? { name: { contains: query.trim(), mode: "insensitive" as const } } : {}) },
      select: { id: true, name: true, slug: true, images: true, price: true, shippingPrice: true, stock: true, colors: true, offers: true },
      orderBy: { name: "asc" }, take: 20,
    });
    const available = await getAvailableStocks(products);
    return products.map(product => ({ id: product.id, name: product.name, slug: product.slug,
      image: product.images[0] || null, price: Number(product.price), shippingPrice: Number(product.shippingPrice),
      available: available.get(product.id) || 0, colors: product.colors, offers: product.offers,
      url: new URL(`/${locale === "en" ? "en" : "ar"}/product/${encodeURIComponent(product.slug)}`, storefront.origin).toString(),
    }));
  });
}

export async function searchSocialInboxOrdersByPhone(input: string) {
  return attempt(async () => {
    await requireAdministrator();
    if (typeof input !== "string" || input.length > 50) throw new Error("أدخل رقم هاتف عراقي واحداً كاملاً");
    const phone = selectedOrderValue("phoneNumber", input);
    const suffix = phone.slice(1);
    const rows = await prisma.order.findMany({
      where: { phoneNumber: { in: [phone, `+964${suffix}`, `964${suffix}`, `00964${suffix}`, suffix] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 11,
      select: { id: true, status: true, phoneNumber: true, deliveryTrackingId: true, createdAt: true, totalPrice: true, governorate: true, isArchived: true,
        orderitems: { select: { name: true, qty: true } } },
    });
    return { phoneNumber: phone, hasMore: rows.length > 10, orders: rows.slice(0, 10).map(order => ({
      ...order, phoneNumber: order.phoneNumber || phone, createdAt: order.createdAt.toISOString(), totalPrice: Number(order.totalPrice),
    })) };
  });
}

/** Orders from a comment are tied to `comment:<id>`, so the same comment cannot be ordered twice by accident. */
type OrderSource = { kind: "comment"; postHandle: string };
const sourceConversation = (ctx: InboxContext, handle: string, source?: OrderSource) =>
  source?.kind === "comment" ? `comment:${resourceId(ctx, "comment", handle)}` : resourceId(ctx, "conversation", handle);

/**
 * Comments are one short line («رايد سيت بابل محاويل 0770…»), which the message
 * extractor often leaves without an address. Fall back to the comment text minus
 * the phone (for the admin to tidy), and accept numbers written without the 0.
 */
function commentOrderFields(text: string, parsed: ReturnType<typeof extractInboxOrder>) {
  const plain = digits(text).replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, "");
  const phoneMatch = plain.replace(/[\s\-–.()]/g, "").match(/(?<!\d)(?:\+?964|00964|0)?(7\d{9})(?!\d)/);
  const phoneNumber = parsed.phoneNumber || (phoneMatch ? `0${phoneMatch[1]}` : "");
  if (parsed.address) return { ...parsed, phoneNumber };
  const rest = plain.replace(/(?:\+?964|00964|0)?\s*7\d(?:[\s\-–.()]*\d){8}/g, " ").replace(/\s+/g, " ").trim();
  return { ...parsed, phoneNumber, address: rest.length >= 3 ? rest.slice(0, 1000) : "",
    warnings: rest.length >= 3 ? [...parsed.warnings, "العنوان مأخوذ من نص التعليق كاملاً؛ احذف منه غير العنوان وأكمل أقرب نقطة دالة."] : parsed.warnings };
}

export async function prepareSocialInboxOrder(input: { pageId: string; platform: SocialPlatform; handle: string; productId?: string; source?: OrderSource }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const conversationId = sourceConversation(ctx, input.handle, input.source);
    const fromComment = input.source?.kind === "comment";
    const messages = fromComment ? { items: [await readInboxComment(ctx, input.handle)], after: null } : await readInboxMessages(ctx, input.handle);
    const parsed = fromComment ? commentOrderFields(messages.items[0].text, extractInboxOrder(messages.items)) : extractInboxOrder(messages.items);
    const storefront = new URL(process.env.SOCIAL_INBOX_STOREFRONT_URL || SERVER_URL);
    const slugs = parsed.slugs.filter(link => link.host === storefront.host).map(link => link.slug);
    const manual = input.productId ? z.string().uuid().parse(input.productId) : null;
    // A comment's product is the post's product (published-for, ad button link, links in the post).
    const postProducts = fromComment ? await resolvePostProducts(ctx, input.source!.postHandle, manual) : [];
    const products = await prisma.product.findMany({
      where: { ...EXCLUDE_INTERNAL_PRODUCTS, OR: [...(manual ? [{ id: manual }] : []), { slug: { in: slugs } }, { id: { in: postProducts.map(product => product.id) } }] },
      select: { id: true, name: true, slug: true, images: true, price: true, shippingPrice: true, stock: true, colors: true, offers: true }, take: 20,
    });
    const rank = new Map([manual, ...postProducts.map(product => product.id)].filter((id): id is string => !!id).map((id, index) => [id, index]));
    products.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
    const available = await getAvailableStocks(products);
    const linked = await prisma.socialInboxOrder.findMany({ where: { pageId: ctx.pageId, platform: ctx.platform, conversationId },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { order: { select: { id: true, status: true, phoneNumber: true, createdAt: true } } } });
    const { slugs: _links, ...fields } = parsed;
    void _links;
    return { ...fields, hasOlderMessages: !!messages.after,
      products: products.map(product => ({ id: product.id, name: product.name, slug: product.slug, image: product.images[0] || null,
        price: Number(product.price), shippingPrice: Number(product.shippingPrice), available: available.get(product.id) || 0,
        colors: product.colors, offers: product.offers,
        url: new URL(`/ar/landing/${encodeURIComponent(product.slug)}`, storefront.origin).toString() })),
      linked: [...new Map(linked.map(({ order }) => [order.id, { ...order, createdAt: order.createdAt.toISOString() }])).values()],
    };
  });
}

export async function approveSocialInboxOrder(input: {
  pageId: string; platform: SocialPlatform; handle: string; requestId: string; productId: string;
  phoneNumber: string; governorate: string; address: string; quantity: number; selectedColor?: string | null; source?: OrderSource;
}) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const conversationId = sourceConversation(ctx, input.handle, input.source);
    const requestId = z.string().uuid().parse(input.requestId);
    const productId = z.string().uuid().parse(input.productId);
    const data = insertOrderSchema.parse({ ...input, fullName: SOCIAL_ORDER_NAME,
      phoneNumber: input.phoneNumber.trim(), address: input.address.trim() });
    if (!iraqGovernorates.includes(data.governorate)) throw new Error("اختر محافظة توصيل صحيحة");
    const requestKey = createHash("sha256").update(JSON.stringify([ctx.pageId, ctx.platform, conversationId, requestId])).digest("hex");
    const result = await submitQuickOrder(data, productId, { canMerge: async () => true,
      receipt: { requestKey, pageId: ctx.pageId, platform: ctx.platform, conversationId, createdBy: ctx.userId } });
    // The commit already succeeded; cache invalidation must never make it appear to fail.
    try { revalidatePath("/[locale]/admin/orders", "page"); } catch { /* Manual refresh remains available. */ }
    return result;
  });
}

/** Posts this Page's ads run on, so comments on ad-only posts show up too. Never fails the list. */
async function adPostIds(pageId: string) {
  try {
    const conn = await prisma.metaConnection.findUnique({ where: { id: "default" }, select: { userAccessToken: true, adAccounts: true } });
    const accounts = Array.isArray(conn?.adAccounts) ? (conn.adAccounts as { id?: unknown }[])
      .map(account => account?.id).filter((id): id is string => typeof id === "string" && /^act_\d{1,30}$/.test(id)) : [];
    if (!conn?.userAccessToken || !accounts.length) return [];
    return await listPageAdPostIds(pageId, conn.userAccessToken, accounts);
  } catch { return []; }
}

async function context(pageId: string, platform: SocialPlatform): Promise<InboxContext> {
  const session = await requireAdministrator();
  if (platform !== "facebook" && platform !== "instagram") throw new Error("منصة غير صالحة");
  const config = getMetaConfig();
  if (!config) throw new Error("أكمل إعداد تطبيق Meta أولاً");
  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken) throw new Error("اربط حساب Meta من صفحة التسويق أولاً");
  if (conn.userTokenExpires && conn.userTokenExpires.getTime() <= Date.now()) throw new Error("انتهى الاتصال؛ أعد الربط");
  const pages = Array.isArray(conn.pages) ? conn.pages as unknown as PageAsset[] : [];
  const page = pages.find(p => p.id === pageId);
  if (!page?.access_token) throw new Error("الصفحة غير موجودة ضمن الصفحات المصرّح بها");
  const igId = page.instagram_business_account?.id;
  if (platform === "instagram" && !igId) throw new Error("هذه الصفحة غير مرتبطة بحساب إنستغرام احترافي متاح للتطبيق");
  return { pageId, platform, token: page.access_token, igId, secret: config.appSecret, userId: session.user.id };
}

export async function checkSocialInboxConnection(input: { pageId: string; platform: SocialPlatform }) {
  return attempt(async () => {
    // Read a single connection snapshot: health and fingerprint must describe the same token.
    await requireAdministrator();
    if (input.platform !== "facebook" && input.platform !== "instagram") throw new Error("منصة غير صالحة");
    const config = getMetaConfig();
    if (!config) throw new Error("أكمل إعداد تطبيق Meta أولاً");
    const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
    const pages = Array.isArray(conn?.pages) ? conn.pages as unknown as PageAsset[] : [];
    const page = pages.find(asset => asset.id === input.pageId);
    if (!conn?.userAccessToken || !page?.access_token) throw new Error("اربط الصفحة المطلوبة من إعداد اتصال Meta أولاً");
    const result = await inspectInboxConnection({ pageId: page.id, platform: input.platform,
      pageToken: page.access_token, userToken: conn.userAccessToken, appId: config.appId, appSecret: config.appSecret });
    console.info("[social-inbox] Page connection check", { pageId: page.id, platform: input.platform,
      appId: config.appId, connectionUpdatedAt: conn.updatedAt?.toISOString(),
      tokenFingerprint: inboxTokenFingerprint(page.access_token, config.appSecret), status: result.status });
    return result;
  });
}

/** Capture the exact sending credential before reconnection replaces it. Never retry a send. */
async function diagnoseSend<T>(ctx: InboxContext, operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof GraphError) {
      console.warn("[social-inbox] Send failed", { pageId: ctx.pageId, platform: ctx.platform,
        appId: getMetaConfig()?.appId, tokenFingerprint: inboxTokenFingerprint(ctx.token, ctx.secret),
        status: error.status, code: error.code, subcode: error.subcode,
        traceId: error.traceId && /^[A-Za-z0-9_-]{1,150}$/.test(error.traceId) ? error.traceId : undefined });
    }
    throw error;
  }
}

async function attempt<T>(fn: () => Promise<T>) {
  try { return { ok: true as const, data: await fn() }; }
  catch (err) {
    if (err instanceof GraphError) {
      // Diagnostic codes only: never log tokens, message bodies or customer data.
      console.warn("[social-inbox] Meta rejected request", {
        status: err.status, code: err.code, subcode: err.subcode, traceId: err.traceId,
      });
    }
    const message = err instanceof GraphError
      ? err.outcomeUnknown ? "لم نستلم تأكيد الإرسال من Meta؛ تحقّق من المحادثة قبل إعادة المحاولة"
      : err.code === 190 ? "انتهت صلاحية الاتصال بـ Meta؛ أعد الربط من التسويق"
      : err.code === 551 ? `تعذّر الرد على هذه المحادثة عبر تطبيق Meta (551${err.subcode ? `/${err.subcode}` : ""}). يمكنك متابعة الرد من Meta Business Suite؛ قد ينجح هناك مع استمرار رفض الإرسال عبر التطبيق. الرمز وحده لا يثبت أن الزبون حظر الصفحة. قبل إعادة الربط، افتح «الصفحة والمنصة» ثم «فحص اتصال المراسلة». إذا فشل مع معظم الزبائن، راجع وضع التطبيق وصلاحيات المراسلة.${err.traceId && /^[A-Za-z0-9_-]{1,150}$/.test(err.traceId) ? ` مرجع دعم Meta: ${err.traceId}` : ""}`
      : [10, 200].includes(err.code ?? 0) ? "Meta رفضت الوصول: راجع أذونات الرسائل/التعليقات وموافقة التطبيق وصلاحيات الصفحة"
      : `تعذر إكمال الطلب لدى Meta (رمز ${err.code ?? err.status}). راجع إعدادات الاتصال ثم أعد التحديث.`
      : err instanceof Error ? err.message : "تعذر إكمال الطلب";
    return { ok: false as const, message, uncertain: (err instanceof GraphError && !!err.outcomeUnknown) || message.includes("لم تؤكد Meta") };
  }
}

/**
 * With Standard Access, Meta lists Instagram conversations only for people who
 * have a role on the app. A busy inbox makes the call fail: code 1 ("reduce the
 * amount of data") or code -2 / subcode 2534084 (timeout). Comments still work.
 */
function isInstagramInboxTooLarge(error: unknown) {
  return error instanceof GraphError && (error.code === 1 || error.subcode === 2534084 || error.code === -2);
}

const INSTAGRAM_INBOX_LIMITED = "رسائل إنستغرام غير متاحة بعد: Meta لا تسمح بجلب صندوق رسائل كبير إلا بعد منح التطبيق «الوصول المتقدم» لإذن instagram_manage_messages (عبر مراجعة التطبيق في Meta). التعليقات تعمل من تبويب «التعليقات»، والرسائل متاحة حالياً من تطبيق إنستغرام أو Business Suite.";

export async function getSocialInboxList(input: { pageId: string; platform: SocialPlatform; kind: "messages" | "comments"; after?: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (input.kind !== "messages" && input.kind !== "comments") throw new Error("قسم غير صالح");
    if (input.kind === "messages") {
      try { return applyInboxReceipts(ctx, await listInboxConversations(ctx, input.after)); }
      catch (error) {
        if (ctx.platform === "instagram" && isInstagramInboxTooLarge(error)) throw new Error(INSTAGRAM_INBOX_LIMITED);
        throw error;
      }
    }
    return listInboxPosts(ctx, input.after, ctx.platform === "facebook" ? await adPostIds(ctx.pageId) : undefined);
  });
}

export async function getSocialInboxDetail(input: { pageId: string; platform: SocialPlatform; kind: "messages" | "comments" | "replies"; handle: string; after?: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (input.kind === "messages") {
      const detail = await readInboxMessages(ctx, input.handle, input.after);
      if (detail.window?.mode === "private-reply" && detail.window.canReply && detail.window.originMessageId &&
        await hasInboxReplyForOrigin(ctx, resourceId(ctx, "conversation", input.handle), detail.window.originMessageId))
        detail.window = { ...detail.window, canReply: false, reason: "private-reply-sent" };
      return { ...detail, items: await applyInboxDelivery(ctx, detail.recipientId, detail.items) };
    }
    if (input.kind !== "comments" && input.kind !== "replies") throw new Error("قسم غير صالح");
    const page = await readInboxComments(ctx, input.handle, input.kind === "replies", input.after);
    const ordered = new Set((await prisma.socialInboxOrder.findMany({ where: { pageId: ctx.pageId, platform: ctx.platform,
      conversationId: { in: page.items.map(item => `comment:${item.id}`) } }, select: { conversationId: true } })).map(row => row.conversationId));
    return { ...page, items: page.items.map(item => ordered.has(`comment:${item.id}`) ? { ...item, ordered: true } : item), window: null };
  });
}

export async function getSocialInboxDelivery(input: { pageId: string; platform: SocialPlatform; handle: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const detail = await readInboxMessages(ctx, input.handle, undefined, false);
    const items = await applyInboxDelivery(ctx, detail.recipientId, detail.items);
    return items.filter(item => item.outgoing).map(({ id, time, deliveryStatus }) => ({ id, time, deliveryStatus }));
  });
}

export async function replyToSocialInbox(input: { pageId: string; platform: SocialPlatform; kind: "messages" | "comments"; handle: string; text: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 1000) throw new Error("اكتب رداً لا يتجاوز 1000 حرف");
    if (input.kind === "messages") {
      const conversationId = resourceId(ctx, "conversation", input.handle);
      const sent = await diagnoseSend(ctx, () => sendInboxMessage(ctx, input.handle, input.text.trim(), async noticeId => {
        if (await hasInboxReplyForOrigin(ctx, conversationId, noticeId))
          throw new Error("سبق إرسال الرد الخاص على هذا التعليق؛ انتظر رد الزبون أو حدّث المحادثة.");
      }));
      try {
        await saveInboxReply(ctx, resourceId(ctx, "conversation", input.handle), sent, input.text.trim());
        return { ...sent, stateSaved: true };
      } catch {
        // Meta has already sent the reply. Never turn a receipt-storage failure into a retryable send failure.
        return { ...sent, stateSaved: false };
      }
    }
    if (input.kind !== "comments") throw new Error("قسم غير صالح");
    const id = await diagnoseSend(ctx, () => sendInboxComment(ctx, input.handle, input.text.trim()));
    // The handle lets the admin delete this reply later.
    return { id, handle: resourceHandle(ctx, "comment", id) };
  });
}

/**
 * Products a post is about: the product it was published for, then storefront
 * links in its text. `productId` is the admin's manual choice and comes first.
 */
export async function getSocialInboxPostProducts(input: { pageId: string; platform: SocialPlatform; handle: string; productId?: string | null }) {
  return attempt(async (): Promise<InboxProduct[]> => {
    const ctx = await context(input.pageId, input.platform);
    return resolvePostProducts(ctx, input.handle, input.productId ? z.string().uuid().parse(input.productId) : null);
  });
}

async function resolvePostProducts(ctx: InboxContext, postHandle: string, manual: string | null): Promise<InboxProduct[]> {
  const post = await readInboxPostText(ctx, postHandle);
  const published = await prisma.socialPost.findFirst({
    where: ctx.platform === "instagram" ? { igPostId: post.id } : { fbPostId: post.id }, select: { productId: true } });
  const storefront = new URL(process.env.SOCIAL_INBOX_STOREFRONT_URL || SERVER_URL);
  const slugs = extractInboxOrder([{ id: post.id, handle: "", title: "", text: post.text, time: "" }]).slugs
    .filter(link => link.host === storefront.host).map(link => link.slug);
  const ids = [manual, published?.productId].filter((id): id is string => !!id);
  if (!ids.length && !slugs.length) return [];
  const products = await prisma.product.findMany({
    where: { ...EXCLUDE_INTERNAL_PRODUCTS, OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...(slugs.length ? [{ slug: { in: slugs } }] : [])] },
    select: { id: true, name: true, slug: true, images: true, price: true, shippingPrice: true, stock: true, colors: true, offers: true }, take: 5,
  });
  const available = await getAvailableStocks(products);
  const rank = (id: string) => id === manual ? 0 : id === published?.productId ? 1 : 2;
  return products.sort((a, b) => rank(a.id) - rank(b.id)).map(product => ({ id: product.id, name: product.name, slug: product.slug,
    image: product.images[0] || null, price: Number(product.price), shippingPrice: Number(product.shippingPrice),
    available: available.get(product.id) || 0, colors: product.colors, offers: product.offers,
    url: new URL(`/ar/landing/${encodeURIComponent(product.slug)}`, storefront.origin).toString() }));
}

/** Public and/or private reply to a comment; see replyToComment for the send order. */
export async function replyToSocialInboxComment(input: { pageId: string; platform: SocialPlatform; handle: string;
  publicText: string; privateText: string; skipIfReplied: boolean; privateRequired?: boolean }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    let publicText = typeof input.publicText === "string" ? input.publicText.trim() : "";
    let privateText = typeof input.privateText === "string" ? input.privateText.trim() : "";
    // Order details come from the order registered from this comment, never from the browser.
    if (usesOrderFields(publicText) || usesOrderFields(privateText)) {
      const saved = await prisma.socialInboxOrder.findFirst({
        where: { pageId: ctx.pageId, platform: ctx.platform, conversationId: `comment:${resourceId(ctx, "comment", input.handle)}` },
        orderBy: { createdAt: "desc" },
        select: { order: { select: { phoneNumber: true, governorate: true, address: true, totalPrice: true, orderitems: { select: { name: true, qty: true } } } } } });
      if (!saved) return { status: "skipped" as const, reason: "no-order" as const, message: "لم يُسجَّل طلب لهذا التعليق بعد؛ اضغط «تسجيل الطلب» أولاً." };
      const order = { ...saved.order, totalPrice: Number(saved.order.totalPrice), items: saved.order.orderitems };
      publicText = fillOrderFields(publicText, order);
      privateText = fillOrderFields(privateText, order);
    }
    if ((!publicText && !privateText) || publicText.length > 1000 || privateText.length > 1000)
      throw new Error("نص الرد فارغ أو يتجاوز 1000 حرف");
    const result = await diagnoseSend(ctx, () => replyToComment(ctx, input.handle, { publicText, privateText,
      skipIfReplied: input.skipIfReplied === true, privateRequired: input.privateRequired !== false }));
    // The handle lets the admin delete the public reply later.
    return "publicId" in result && result.publicId ? { ...result, publicHandle: resourceHandle(ctx, "comment", result.publicId) } : result;
  });
}

/** Hide, show or delete a comment, or block its author from the Facebook Page. */
export async function moderateSocialInboxComment(input: { pageId: string; platform: SocialPlatform; handle: string;
  action: "hide" | "unhide" | "delete" | "block" }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (input.action === "block") await blockInboxCommentAuthor(ctx, input.handle);
    else if (input.action === "hide" || input.action === "unhide" || input.action === "delete")
      await moderateInboxComment(ctx, input.handle, input.action);
    else throw new Error("إجراء غير صالح");
    return { action: input.action };
  });
}

export async function markSocialInboxRead(input: { pageId: string; platform: SocialPlatform; handle: string; messageId: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const result = await markInboxConversationRead(ctx, input.handle, input.messageId);
    if (result.marked) await saveInboxRead(ctx, resourceId(ctx, "conversation", input.handle), input.messageId);
    return result;
  });
}

// Sanitized metadata for upload authorization. Never return the Page token.
export async function getSocialInboxUploadScope(input: { pageId: string; platform: SocialPlatform; handle: string }) {
  const ctx = await context(input.pageId, input.platform);
  return { pageId: ctx.pageId, platform: ctx.platform, userId: ctx.userId,
    conversationId: resourceId(ctx, "conversation", input.handle) };
}

export async function sendSocialInboxMedia(input: { pageId: string; platform: SocialPlatform; handle: string; ticket: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const conversationId = resourceId(ctx, "conversation", input.handle);
    const media = verifyInboxMedia({ pageId: ctx.pageId, platform: ctx.platform, userId: ctx.userId, conversationId }, input.ticket, ctx.secret);
    const sent = await diagnoseSend(ctx, () => sendInboxMediaMessage(ctx, input.handle, media));
    let stateSaved = true;
    try { await saveInboxReply(ctx, conversationId, sent, media.kind === "image" ? "صورة" : "فيديو"); }
    catch { stateSaved = false; }
    return { ...sent, stateSaved, media };
  });
}
