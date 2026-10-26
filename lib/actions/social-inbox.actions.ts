"use server";

import { prisma } from "@/db/prisma";
import { requireAdministrator } from "@/lib/authorization";
import { getMetaConfig } from "@/lib/meta/config";
import { GraphError } from "@/lib/meta/graph";
import { listInboxConversations, listInboxPosts, readInboxMessages, readInboxComments,
  sendInboxMessage, sendInboxMediaMessage, sendInboxComment, markInboxConversationRead, readInboxOrigin, resourceId, type SocialPlatform, type InboxContext } from "@/lib/meta/inbox";
import { verifyInboxMedia } from "@/lib/meta/inbox-media-ticket";
import { applyInboxReceipts, saveInboxRead, saveInboxReply } from "@/lib/meta/inbox-receipts";
import { EXCLUDE_INTERNAL_PRODUCTS } from "@/lib/constants/internal-products";
import { getAvailableStocks } from "@/lib/inventory";
import { SERVER_URL } from "@/lib/constants";
import type { InboxProduct } from "@/lib/meta/inbox-tools";
import { createHash } from "node:crypto";
import { z } from "zod";
import { insertOrderSchema } from "@/lib/validators";
import { iraqGovernorates } from "@/lib/constants";
import { extractInboxOrder, SOCIAL_ORDER_NAME } from "@/lib/meta/inbox-order";
import { submitQuickOrder } from "@/lib/orders/quick-order";
import { revalidatePath } from "next/cache";
import { applyInboxDelivery } from "@/lib/meta/inbox-delivery-storage";
import { selectedOrderValue } from "@/lib/meta/inbox-workflow";

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

export async function prepareSocialInboxOrder(input: { pageId: string; platform: SocialPlatform; handle: string; productId?: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const conversationId = resourceId(ctx, "conversation", input.handle);
    const messages = await readInboxMessages(ctx, input.handle);
    const parsed = extractInboxOrder(messages.items);
    const storefront = new URL(process.env.SOCIAL_INBOX_STOREFRONT_URL || SERVER_URL);
    const slugs = parsed.slugs.filter(link => link.host === storefront.host).map(link => link.slug);
    const products = await prisma.product.findMany({
      where: { ...EXCLUDE_INTERNAL_PRODUCTS, OR: [...(input.productId ? [{ id: z.string().uuid().parse(input.productId) }] : []), { slug: { in: slugs } }] },
      select: { id: true, name: true, slug: true, images: true, price: true, shippingPrice: true, stock: true, colors: true, offers: true }, take: 20,
    });
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
  phoneNumber: string; governorate: string; address: string; quantity: number; selectedColor?: string | null;
}) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const conversationId = resourceId(ctx, "conversation", input.handle);
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
      : err.code === 551 ? `رفضت Meta تسليم الرسالة (551${err.subcode ? `/${err.subcode}` : ""}). إذا تكرر الرفض مع عدة زبائن، راجع وضع التطبيق وإتاحة pages_messaging وقيود الصفحة في Meta؛ لا يحدد هذا الرمز وحده السبب.`
      : [10, 200].includes(err.code ?? 0) ? "Meta رفضت الوصول: راجع أذونات الرسائل/التعليقات وموافقة التطبيق وصلاحيات الصفحة"
      : `تعذر إكمال الطلب لدى Meta (رمز ${err.code ?? err.status}). راجع إعدادات الاتصال ثم أعد التحديث.`
      : err instanceof Error ? err.message : "تعذر إكمال الطلب";
    return { ok: false as const, message, uncertain: (err instanceof GraphError && !!err.outcomeUnknown) || message.includes("لم تؤكد Meta") };
  }
}

export async function getSocialInboxList(input: { pageId: string; platform: SocialPlatform; kind: "messages" | "comments"; after?: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (input.kind !== "messages" && input.kind !== "comments") throw new Error("قسم غير صالح");
    return input.kind === "messages" ? applyInboxReceipts(ctx, await listInboxConversations(ctx, input.after)) : listInboxPosts(ctx, input.after);
  });
}

export async function getSocialInboxDetail(input: { pageId: string; platform: SocialPlatform; kind: "messages" | "comments" | "replies"; handle: string; after?: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (input.kind === "messages") {
      const detail = await readInboxMessages(ctx, input.handle, input.after);
      return { ...detail, items: await applyInboxDelivery(ctx, detail.recipientId, detail.items) };
    }
    if (input.kind !== "comments" && input.kind !== "replies") throw new Error("قسم غير صالح");
    return { ...await readInboxComments(ctx, input.handle, input.kind === "replies", input.after), window: null };
  });
}

export async function getSocialInboxDelivery(input: { pageId: string; platform: SocialPlatform; handle: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    const detail = await readInboxMessages(ctx, input.handle);
    const items = await applyInboxDelivery(ctx, detail.recipientId, detail.items);
    return items.filter(item => item.outgoing).map(({ id, time, deliveryStatus }) => ({ id, time, deliveryStatus }));
  });
}

export async function replyToSocialInbox(input: { pageId: string; platform: SocialPlatform; kind: "messages" | "comments"; handle: string; text: string }) {
  return attempt(async () => {
    const ctx = await context(input.pageId, input.platform);
    if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 1000) throw new Error("اكتب رداً لا يتجاوز 1000 حرف");
    if (input.kind === "messages") {
      const sent = await sendInboxMessage(ctx, input.handle, input.text.trim());
      try {
        await saveInboxReply(ctx, resourceId(ctx, "conversation", input.handle), sent, input.text.trim());
        return { ...sent, stateSaved: true };
      } catch {
        // Meta has already sent the reply. Never turn a receipt-storage failure into a retryable send failure.
        return { ...sent, stateSaved: false };
      }
    }
    if (input.kind !== "comments") throw new Error("قسم غير صالح");
    return { id: await sendInboxComment(ctx, input.handle, input.text.trim()) };
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
    const sent = await sendInboxMediaMessage(ctx, input.handle, media);
    let stateSaved = true;
    try { await saveInboxReply(ctx, conversationId, sent, media.kind === "image" ? "صورة" : "فيديو"); }
    catch { stateSaved = false; }
    return { ...sent, stateSaved, media };
  });
}
