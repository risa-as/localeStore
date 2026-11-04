import crypto from "crypto";
import { graphGet, graphPost, graphDelete, GraphError } from "./graph";
import type { InboxMedia } from "./inbox-media";
import type { InboxProduct } from "./inbox-tools";
import type { DeliveryStatus } from "./inbox-delivery";
import { UNKNOWN_AUTHOR } from "./comment-replies";
import { classifyComment, type CommentIntent } from "./comment-intent";

export type SocialPlatform = "facebook" | "instagram";
export type InboxContext = {
  pageId: string; platform: SocialPlatform; token: string;
  igId?: string; secret: string; userId: string;
};
export type InboxItem = {
  id: string; handle: string; title: string; text: string; time: string;
  outgoing?: boolean; unread?: number; url?: string; lastMessageId?: string;
  system?: "comment-origin"; commentUrl?: string;
  commentCopy?: boolean;
  deliveryStatus?: DeliveryStatus;
  sendError?: string;
  authorId?: string;
  authorUsername?: string;
  /** Comment hidden from the public (still visible to the author and the Page). */
  hidden?: boolean;
  /** Posts list: the latest comment, shown under the post title. */
  preview?: string;
  commentCount?: number;
  /** Comments: what the customer is asking for (see classifyComment). */
  intent?: CommentIntent;
  /** Comments: the Page already replied under it (publicly or privately). */
  answered?: boolean;
  /** Comments: an order was already registered from it. */
  ordered?: boolean;
  attachments?: { name: string; url: string; kind?: "image" | "sticker" | "audio" | "video" | "file"; width?: number; height?: number }[];
};
export type InboxPage = { items: InboxItem[]; after: string | null };
export type InboxOrigin = { comment: InboxItem; post: InboxItem | null; commentUnavailable?: boolean; products?: InboxProduct[];
  privateReply?: { commentId: string; createdAt: string; allowed: boolean; alreadyReplied: boolean; noticeId: string } };
export type InboxReplyWindow = { recipient: string | null; expiresAt: string | null; canReply: boolean;
  reason?: "comment-origin" | "private-reply-sent" | "private-reply-expired" | "comment-unavailable";
  mode?: "private-reply"; originMessageId?: string };
export type GraphPage<T> = {
  data?: T[];
  paging?: { next?: string; cursors?: { after?: string } };
};
type Kind = "conversation" | "post" | "comment";
type Person = { id: string; name?: string; username?: string };
type Message = {
  id: string; message?: string; from?: Person; created_time?: string; sticker?: string;
  attachments?: { data?: { name?: string; file_url?: string; mime_type?: string;
    image_data?: { url?: string; width?: number; height?: number; render_as_sticker?: boolean; sticker_id?: string | number };
    audio_data?: { url?: string }; video_data?: { url?: string } }[] };
};
type Comment = {
  id: string; message?: string; text?: string; username?: string;
  from?: Person; created_time?: string; timestamp?: string;
  is_hidden?: boolean; hidden?: boolean;
  /** Facebook replies under the comment / Instagram replies. */
  comments?: { data?: { from?: Person }[] }; replies?: { data?: { from?: Person }[] };
  private_reply_conversation?: { id?: string };
};

const path = (id: string) => encodeURIComponent(id);
const own = (ctx: InboxContext, id?: string) => !!id && [ctx.pageId, ctx.igId].includes(id);

// A resource can only be used in the page/platform/admin context that listed it.
// These short-lived handles contain IDs, never access tokens.
export function resourceHandle(ctx: InboxContext, kind: Kind, id: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ page: ctx.pageId, platform: ctx.platform,
    user: ctx.userId, kind, id, expires: now + 86400000 })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", ctx.secret).update(body).digest("base64url")}`;
}

export function resourceId(ctx: InboxContext, kind: Kind, handle: string, now = Date.now()): string {
  if (typeof handle !== "string" || handle.length > 6000) throw new Error("مرجع غير صالح؛ حدّث القائمة");
  const [body, signature, extra] = handle.split(".");
  if (!body || !signature || extra) throw new Error("مرجع غير صالح؛ حدّث القائمة");
  const expected = crypto.createHmac("sha256", ctx.secret).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected))
    throw new Error("مرجع غير صالح؛ حدّث القائمة");
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  if (data.page !== ctx.pageId || data.platform !== ctx.platform || data.user !== ctx.userId ||
      data.kind !== kind || !Number.isFinite(data.expires) || data.expires <= now ||
      typeof data.id !== "string" || !data.id || data.id.length > 2000)
    throw new Error("انتهى المرجع أو لا يخص هذه الصفحة؛ حدّث القائمة");
  return data.id;
}

function next<T>(res: GraphPage<T>) {
  return res.paging?.next ? res.paging.cursors?.after ?? null : null;
}

function params(after?: string) {
  if (after && (typeof after !== "string" || after.length > 6000)) throw new Error("مؤشر غير صالح");
  return { limit: "50", after: after || undefined };
}

export function safeSocialUrl(value?: string) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.toString() : undefined; }
  catch { return undefined; }
}

export function commentOriginNotice(value = "") {
  const text = value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!/^(?:أنشأ فيسبوك هذه (?:الدردشة|المحادثة)|Facebook created this (?:chat|conversation))/iu.test(text) ||
      !/(?:بالتعليق على|comment(?:ed|ing) on)/iu.test(text)) return null;
  const match = text.match(/https?:\/\/[^\s<>()]+/iu);
  const candidate = safeSocialUrl(match?.[0]);
  const host = candidate ? new URL(candidate).hostname : "";
  const commentUrl = /^(?:[a-z0-9-]+\.)*facebook\.com$/i.test(host) ? candidate : undefined;
  return { text: text.replace(/(?:عرض التعليق|View comment|See comment)\s*\(https?:\/\/[^\s<>()]+\)/iu, "").trim(), commentUrl };
}

function inlineMediaUrl(value?: string) {
  const url = safeSocialUrl(value);
  return url && /(?:^|\.)(?:fbcdn\.net|cdninstagram\.com|fbsbx\.com|ufs\.sh|utfs\.io)$/i.test(new URL(url).hostname) ? url : undefined;
}

function messageItem(ctx: InboxContext, message: Message): InboxItem {
  const notice = ctx.platform === "facebook" ? commentOriginNotice(message.message) : null;
  const attachments = (message.attachments?.data ?? []).flatMap(a => {
    const url = safeSocialUrl(a.audio_data?.url || a.video_data?.url || a.file_url || a.image_data?.url);
    if (!url) return [];
    const sticker = !!a.image_data?.render_as_sticker || !!a.image_data?.sticker_id || /^sticker[-_]/i.test(a.name || "");
    const image = !!a.image_data || a.mime_type?.startsWith("image/");
    const filename = (a.name || new URL(url).pathname.split("/").pop() || "").toLowerCase();
    const mime = (a.mime_type || "").toLowerCase();
    // Messenger voice notes can have an .mp4 filename or even video/mp4 MIME.
    const audio = mime.startsWith("audio/") || !!a.audio_data || /^audioclip[-_]/i.test(filename) ||
      /\.(?:mp3|m4a|aac|wav|oga|ogg|opus|flac)$/i.test(filename);
    const video = mime.startsWith("video/") || !!a.video_data || /\.(?:mp4|m4v|mov|webm|ogv)$/i.test(filename);
    const kind = inlineMediaUrl(url) ? sticker ? "sticker" as const : audio ? "audio" as const : video ? "video" as const
      : image ? "image" as const : "file" as const : "file" as const;
    return [{ name: kind === "sticker" ? "ملصق" : kind === "image" ? "صورة" : kind === "audio" ? "رسالة صوتية" : kind === "video" ? "فيديو" : a.name || "عرض المرفق", url, kind,
      width: a.image_data?.width, height: a.image_data?.height }];
  });
  const stickerUrl = inlineMediaUrl(message.sticker);
  if (stickerUrl && !attachments.some(a => a.kind === "sticker"))
    attachments.push({ name: "ملصق", url: stickerUrl, kind: "sticker", width: undefined, height: undefined });
  return { id: message.id, handle: "", title: notice ? "إشعار من فيسبوك" : message.from?.name || message.from?.username || "زبون",
    text: notice?.text || message.message || (attachments.length ? "" : "[رسالة غير نصية]"),
    time: message.created_time || "", outgoing: notice ? undefined : own(ctx, message.from?.id), attachments,
    system: notice ? "comment-origin" : undefined, commentUrl: notice?.commentUrl };
}

function latestMessage(messages: Message[]) {
  return [...messages].sort((a, b) => (Date.parse(b.created_time || "") || 0) - (Date.parse(a.created_time || "") || 0))[0];
}

const messageText = (text = "") => text.normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
function latestOrigin(ctx: InboxContext, messages: Message[]) {
  return ctx.platform === "facebook" ? latestMessage(messages.filter(m => commentOriginNotice(m.message))) : undefined;
}

function copiedComment(ctx: InboxContext, messages: Message[], origin?: InboxOrigin | null) {
  const notice = latestOrigin(ctx, messages);
  if (!notice) return undefined;
  const at = Date.parse(notice.created_time || "");
  const first = messages.filter(m => m.from?.id && !own(ctx, m.from.id) && !commentOriginNotice(m.message) && Date.parse(m.created_time || "") > at)
    .sort((a, b) => Date.parse(a.created_time || "") - Date.parse(b.created_time || ""))[0];
  // Meta inserts a comment copy a few seconds AFTER the system notice. Until its
  // source can be verified, that first near-simultaneous item is not evidence of a DM.
  if (!first || Date.parse(first.created_time || "") > at + 60000 || first.attachments?.data?.length || first.sticker) return undefined;
  return !origin || origin.commentUnavailable || messageText(first.message) === messageText(origin.comment.text) ? first.id : undefined;
}

export function replyWindow(ctx: InboxContext, messages: Message[], now = Date.now(), origin?: InboxOrigin | null): InboxReplyWindow {
  const notices = ctx.platform === "facebook" ? messages.filter(m => commentOriginNotice(m.message)) : [];
  const originAt = Math.max(...notices.map(m => Date.parse(m.created_time || "")).filter(Number.isFinite), -Infinity);
  const copyId = copiedComment(ctx, messages, origin);
  const incoming = messages.filter(m => m.from?.id && !own(ctx, m.from.id) &&
      m.id !== copyId && !(ctx.platform === "facebook" && commentOriginNotice(m.message)) && Date.parse(m.created_time || "") > originAt)
    .map(m => ({ recipient: m.from!.id, at: Date.parse(m.created_time || "") }))
    .filter(m => Number.isFinite(m.at) && m.at <= now)
    .sort((a, b) => b.at - a.at)[0];
  const expires = incoming ? incoming.at + 86400000 : null;
  return { recipient: incoming?.recipient ?? null, expiresAt: expires ? new Date(expires).toISOString() : null,
    canReply: !!expires && expires > now, reason: !incoming && notices.length ? "comment-origin" as const : undefined };
}

async function resolveInboxReply(ctx: InboxContext, messages: Message[]) {
  const initial = replyWindow(ctx, messages);
  if (initial.reason !== "comment-origin") return { window: initial, copyId: undefined, commentId: undefined };
  const notice = latestOrigin(ctx, messages)!;
  const origin = await inboxOriginFromHistory(ctx, messages, notice.id);
  const standard = replyWindow(ctx, messages, Date.now(), origin);
  const copyId = copiedComment(ctx, messages, origin);
  if (standard.reason !== "comment-origin") return { window: standard, copyId, commentId: undefined };
  const source = origin?.privateReply;
  const created = Date.parse(source?.createdAt || "");
  const expiry = created + 7 * 86400000;
  const alreadyReplied = !!source?.alreadyReplied || messages.some(m => own(ctx, m.from?.id) && Date.parse(m.created_time || "") >= created);
  const canReply = !!origin?.post && !!source?.allowed && !alreadyReplied && created <= Date.now() && expiry > Date.now();
  const window: InboxReplyWindow = { ...standard, canReply, mode: "private-reply", originMessageId: notice.id,
    expiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    reason: alreadyReplied ? "private-reply-sent" : Number.isFinite(expiry) && expiry <= Date.now() ? "private-reply-expired"
      : canReply ? "comment-origin" : "comment-unavailable" };
  return { window, copyId, commentId: source?.commentId };
}

const messageFields = (ctx: InboxContext) => `id,message,from,created_time,attachments${ctx.platform === "facebook" ? ",sticker" : ""}`;

export async function listInboxConversations(ctx: InboxContext, after?: string): Promise<InboxPage> {
  const res = await graphGet<GraphPage<{ id: string; updated_time?: string;
    participants?: { data?: Person[] }; unread_count?: number; messages?: { data?: Message[] } }>>(
    `${path(ctx.pageId)}/conversations`, ctx.token, { ...params(after),
      platform: ctx.platform === "instagram" ? "instagram" : "messenger",
      fields: `id,updated_time,participants,messages.limit(1){${messageFields(ctx)}}${ctx.platform === "facebook" ? ",unread_count" : ""}` });
  return { items: (res.data ?? []).map(c => {
    const peer = c.participants?.data?.find(p => !own(ctx, p.id));
    const last = c.messages?.data?.[0];
    const notice = ctx.platform === "facebook" ? commentOriginNotice(last?.message) : null;
    const media = last ? messageItem(ctx, last).attachments?.[0] : undefined;
    return { id: c.id, handle: resourceHandle(ctx, "conversation", c.id), title: peer?.name || peer?.username || "زبون",
      text: notice ? "محادثة بدأت من تعليق على منشور" : last?.message || (media ? media.kind === "sticker" ? "ملصق" : media.kind === "image" ? "صورة" : media.kind === "audio" ? "رسالة صوتية" : media.kind === "video" ? "فيديو" : "مرفق" : "[محادثة]"), time: last?.created_time || c.updated_time || "", unread: c.unread_count,
      lastMessageId: last?.id,
      system: notice ? "comment-origin" as const : undefined, commentUrl: notice?.commentUrl,
      outgoing: !notice && last?.from?.id ? own(ctx, last.from.id) : undefined };
  }), after: next(res) };
}

export async function readInboxMessages(ctx: InboxContext, handle: string, after?: string, withReplyContext = true) {
  const id = resourceId(ctx, "conversation", handle);
  const res = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { ...params(after), fields: messageFields(ctx) });
  let recipientId = (res.data ?? []).find(m => m.from?.id && !own(ctx, m.from.id))?.from?.id;
  if (!recipientId && res.data?.some(m => own(ctx, m.from?.id))) {
    const conversation = await graphGet<{ participants?: { data?: Person[] } }>(path(id), ctx.token, { fields: "participants" });
    recipientId = conversation.participants?.data?.find(person => !own(ctx, person.id))?.id;
  }
  const reply = after || !withReplyContext ? null : await resolveInboxReply(ctx, res.data ?? []);
  // Older pagination pages must never extend the reply window.
  return { items: (res.data ?? []).map(m => ({ ...messageItem(ctx, m), ...(m.id === reply?.copyId ? { commentCopy: true } : {}) })), after: next(res),
    recipientId,
    window: reply?.window ?? null,
    latestMessageId: after ? undefined : latestMessage(res.data ?? [])?.id };
}

/** Resolve the source from Meta history, never from a client-supplied URL or ID. */
export async function readInboxOrigin(ctx: InboxContext, handle: string, messageId?: string): Promise<InboxOrigin | null> {
  const id = resourceId(ctx, "conversation", handle);
  if (ctx.platform !== "facebook") return null;
  const history = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { fields: "id,message,from,created_time", limit: "100" });
  return inboxOriginFromHistory(ctx, history.data || [], messageId);
}

async function inboxOriginFromHistory(ctx: InboxContext, history: Message[], messageId?: string): Promise<InboxOrigin | null> {
  const notice = history.filter(message => !messageId || message.id === messageId)
    .find(message => commentOriginNotice(message.message)?.commentUrl);
  const link = notice && commentOriginNotice(notice.message)?.commentUrl;
  if (!link) return null;
  const sourceUrl = new URL(link);
  const commentId = sourceUrl.searchParams.get("comment_id");
  if (!commentId || !/^\d{1,100}$/.test(commentId)) return null;
  let source: Comment & { object?: { id?: string }; can_reply_privately?: boolean; private_reply_conversation?: { id?: string } } = { id: commentId };
  let commentUnavailable = false;
  try {
    source = await graphGet<typeof source>(path(commentId), ctx.token, { fields: "id,message,from,created_time,object{id},can_reply_privately,private_reply_conversation" });
  } catch (error) {
    if (error instanceof GraphError && error.code === 190) throw error;
    // Deleted/restricted comments must not prevent loading an accessible post.
    commentUnavailable = true;
  }
  const comment: InboxItem = { id: source.id, handle: "", title: source.from?.name || "زبون",
    text: commentUnavailable ? "تعذر جلب نص التعليق؛ قد يكون محذوفاً أو غير متاح للتطبيق." : source.message || "[تعليق غير نصي]", time: source.created_time || "", url: link };
  let post: InboxItem | null = null;
  // Some Messenger notices return a numeric comment ID without `object`.
  // Their Meta-generated GraphQL reference includes the original post ID.
  const reference = Buffer.from(sourceUrl.searchParams.get("comment_gqlid") || "", "base64").toString("utf8")
    .match(/^comment:(\d{1,100})_(\d{1,100})$/);
  const hintedPost = reference?.[2] === commentId ? reference[1] : undefined;
  const explicitPost = sourceUrl.searchParams.get("post_id") || "";
  const explicitParts = explicitPost.match(/^([A-Za-z0-9]+)_(\d{1,100}|pfbid[A-Za-z0-9]{1,200})$/);
  const explicitSuffix = explicitParts?.[2] || "";
  const story = sourceUrl.searchParams.get("story_fbid") || "";
  const validPostPart = (value: string) => /^(?:\d{1,100}|pfbid[A-Za-z0-9]{1,200})$/.test(value);
  // Facebook's public permalink can use a profile/alias ID different from the
  // Page's Graph ID. Resolve the opaque pfbid through the authorized Page;
  // the returned `from.id` below remains the ownership check.
  const explicitBelongsToPage = explicitParts?.[1] === ctx.pageId || explicitSuffix.startsWith("pfbid");
  const storyBelongsToPage = sourceUrl.searchParams.get("id") === ctx.pageId || story.startsWith("pfbid");
  const candidates = [...new Set([
    source.object?.id, hintedPost,
    explicitBelongsToPage && validPostPart(explicitSuffix) ? `${ctx.pageId}_${explicitSuffix}` : undefined,
    storyBelongsToPage && validPostPart(story) ? `${ctx.pageId}_${story}` : undefined,
  ].filter((value): value is string => !!value))];
  for (const objectId of candidates) {
    try {
      const postId = /^\d+$/.test(objectId) ? `${ctx.pageId}_${objectId}` : objectId;
      const object = await graphGet<{ id: string; message?: string; full_picture?: string; created_time?: string; permalink_url?: string; from?: Person }>(
        path(postId), ctx.token, { fields: "id,message,created_time,permalink_url,from,full_picture" });
      if (object.from?.id === ctx.pageId) {
        const picture = inlineMediaUrl(object.full_picture);
        post = { id: object.id, handle: "", title: "المنشور الأصلي",
          text: object.message || "منشور بدون نص", time: object.created_time || "", url: safeSocialUrl(object.permalink_url),
          ...(picture ? { attachments: [{ name: "صورة المنشور", kind: "image" as const, url: picture }] } : {}) };
        break;
      }
    } catch (error) {
      if (error instanceof GraphError && error.code === 190) throw error;
      // The comment remains useful when its post is unavailable to this app.
    }
  }
  return { comment, post, ...(commentUnavailable ? { commentUnavailable: true } : {}),
    privateReply: { commentId: source.id, createdAt: source.created_time || "", allowed: source.can_reply_privately === true,
      alreadyReplied: !!source.private_reply_conversation, noticeId: notice!.id } };
}

/** Only acknowledge the message the administrator actually loaded, never a newer arrival. */
export async function markInboxConversationRead(ctx: InboxContext, handle: string, observedMessageId: string) {
  const id = resourceId(ctx, "conversation", handle);
  if (typeof observedMessageId !== "string" || !observedMessageId || observedMessageId.length > 2000)
    throw new Error("مرجع الرسالة غير صالح؛ حدّث المحادثة");
  const res = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { fields: "id,message,from,created_time", limit: "100" });
  if (latestMessage(res.data ?? [])?.id !== observedMessageId) return { marked: false };
  const reply = await resolveInboxReply(ctx, res.data ?? []);
  if (reply.window.mode === "private-reply")
    return { marked: true, messageId: observedMessageId, metaSynced: false, metaSyncRequired: false };
  const recipient = (res.data ?? []).find(message => message.from?.id && !own(ctx, message.from.id))?.from?.id;
  let metaSynced = false;
  if (ctx.platform === "facebook" && recipient) {
    try {
      const receipt = await graphPost<{ recipient_id?: string }>(`${path(ctx.pageId)}/messages`, ctx.token,
        { recipient: { id: recipient }, sender_action: "mark_seen" });
      metaSynced = receipt.recipient_id === recipient;
    } catch { /* Local read state is independent of Meta's sender-action support. */ }
  }
  return { marked: true, messageId: observedMessageId, metaSynced };
}

export async function sendInboxMessage(ctx: InboxContext, handle: string, text: string, beforePrivateReply?: (noticeId: string) => Promise<void>) {
  return sendInboxContent(ctx, handle, { text }, beforePrivateReply);
}

export async function sendInboxMediaMessage(ctx: InboxContext, handle: string, media: InboxMedia) {
  return sendInboxContent(ctx, handle, { attachment: { type: media.kind, payload: { url: media.url } } });
}

async function sendInboxContent(ctx: InboxContext, handle: string, message: Record<string, unknown>, beforePrivateReply?: (noticeId: string) => Promise<void>) {
  const id = resourceId(ctx, "conversation", handle);
  // Re-read on the server at send time; never accept a client recipient/window.
  const res = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { fields: "id,message,from,created_time", limit: "100" });
  const { window, commentId } = await resolveInboxReply(ctx, res.data ?? []);
  if (window.mode === "private-reply" && !window.canReply)
    throw new Error(window.reason === "private-reply-sent" ? "أُرسل الرد الخاص على التعليق؛ انتظر رسالة خاصة جديدة من الزبون قبل المتابعة."
      : window.reason === "private-reply-expired" ? "انتهت مهلة الرد الخاص على التعليق (7 أيام). افتح المصدر في فيسبوك."
      : "تعذر تأكيد إتاحة الرد الخاص على هذا التعليق؛ حدّث المحادثة أو تابعها من Meta.");
  if (!window.canReply || (window.mode !== "private-reply" && !window.recipient))
    throw new Error("نافذة الرد العادي مغلقة أو لم نجد رسالة واردة حديثة. افتح المحادثة في Meta Business Suite.");
  if (window.mode === "private-reply" && (message.attachment || !commentId))
    throw new Error("الرد الأول على التعليق نصي فقط؛ أرسل الصور والفيديو بعد أن يرد الزبون برسالة خاصة.");
  if (window.mode === "private-reply") await beforePrivateReply?.(window.originMessageId!);
  const sent = await graphPost<{ message_id?: string }>(`${path(ctx.pageId)}/messages`, ctx.token,
    window.mode === "private-reply" ? { recipient: { comment_id: commentId }, message }
      : { recipient: { id: window.recipient }, messaging_type: "RESPONSE", message });
  if (!sent?.message_id) throw new Error("لم تؤكد Meta إرسال الرسالة؛ تحقّق من المحادثة قبل إعادة المحاولة");
  return { id: sent.message_id, previousMessageIds: (res.data ?? []).map(message => message.id),
    ...(window.mode === "private-reply" ? { replyMode: "private-reply" as const, originMessageId: window.originMessageId } : {}) };
}

const POSTS_PAGE = 30;
const MAX_SCANNED_POSTS = 500;
const scanCache = new Map<string, { at: number; posts: { id: string; updated: number }[] }>();

/**
 * Facebook lists posts by creation date, so an old post (a January reel) with a
 * comment today would be buried. Scan the Page's posts cheaply, sort them by
 * `updated_time` (which moves on every new comment), then fetch details and the
 * latest comment for one page of them in a single request — like Business Suite.
 */
const adStoryCache = new Map<string, { at: number; ids: string[] }>();

/**
 * Ad-only ("dark") posts never appear in /{page}/posts, yet most comments land
 * on them. Collect the posts this Page's ads run on, across the connected ad
 * accounts (user token). Cached for 10 minutes; failures just mean no ad posts.
 */
export async function listPageAdPostIds(pageId: string, userToken: string, adAccountIds: string[]) {
  const cached = adStoryCache.get(pageId);
  if (cached && Date.now() - cached.at < 600000) return cached.ids;
  const results = await Promise.allSettled(adAccountIds.slice(0, 30).map(account =>
    graphGet<GraphPage<{ creative?: { effective_object_story_id?: string } }>>(`${path(account)}/ads`, userToken, {
      fields: "creative{effective_object_story_id}", limit: "500",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "DISAPPROVED"]) })));
  const ids = [...new Set(results.flatMap(result => result.status === "fulfilled" ? result.value.data ?? [] : [])
    .map(ad => ad.creative?.effective_object_story_id)
    .filter((id): id is string => !!id && id.startsWith(`${pageId}_`) && id.length < 200))];
  if (results.some(result => result.status === "rejected"))
    console.warn("[social-inbox] Some ad accounts could not be read for ad posts", { pageId,
      failed: results.filter(result => result.status === "rejected").length });
  adStoryCache.set(pageId, { at: Date.now(), ids });
  return ids;
}

async function listFacebookPostsByActivity(ctx: InboxContext, after?: string, adPostIds: string[] = []): Promise<InboxPage> {
  const offset = after ? Number(after.match(/^offset:(\d{1,4})$/)?.[1] ?? NaN) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error("مؤشر غير صالح");
  const cached = scanCache.get(ctx.pageId);
  let posts = cached && Date.now() - cached.at < 45000 && offset > 0 ? cached.posts : null;
  if (!posts) {
    const stamp = (post: { updated_time?: string; created_time?: string }) => Date.parse(post.updated_time || post.created_time || "") || 0;
    const scanPublished = async () => {
      const found: { id: string; updated: number }[] = [];
      let cursor: string | undefined;
      do {
        const res = await graphGet<GraphPage<{ id: string; updated_time?: string; created_time?: string }>>(`${path(ctx.pageId)}/posts`, ctx.token,
          { fields: "id,updated_time,created_time", limit: "100", after: cursor });
        found.push(...(res.data ?? []).map(post => ({ id: post.id, updated: stamp(post) })));
        cursor = next(res) ?? undefined;
      } while (cursor && found.length < MAX_SCANNED_POSTS);
      return found;
    };
    // Ad posts: fetch their activity time 50 at a time (the `ids` limit).
    const scanAds = async () => {
      const ids = adPostIds.filter(id => id.startsWith(`${ctx.pageId}_`)).slice(0, MAX_SCANNED_POSTS);
      const chunks = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50));
      const pages = await Promise.allSettled(chunks.map(chunk => graphGet<Record<string, { id: string; updated_time?: string; created_time?: string }>>(
        "", ctx.token, { ids: chunk.join(","), fields: "id,updated_time,created_time" })));
      return pages.flatMap(page => page.status === "fulfilled" ? Object.values(page.value) : [])
        .map(post => ({ id: post.id, updated: stamp(post) }));
    };
    const [published, ads] = await Promise.all([scanPublished(), scanAds()]);
    posts = [...new Map([...ads, ...published].map(post => [post.id, post])).values()].sort((a, b) => b.updated - a.updated);
    scanCache.set(ctx.pageId, { at: Date.now(), posts });
  }
  const slice = posts.slice(offset, offset + POSTS_PAGE);
  if (!slice.length) return { items: [], after: null };
  type Detail = { id: string; message?: string; created_time?: string; permalink_url?: string;
    comments?: { data?: (Comment & { from?: Person })[]; summary?: { total_count?: number } } };
  const details = await graphGet<Record<string, Detail>>("", ctx.token, { ids: slice.map(post => post.id).join(","),
    // `stream` includes replies, so a Page reply under a comment counts as answered.
    fields: "id,message,created_time,permalink_url,comments.filter(stream).order(reverse_chronological).limit(1).summary(true){id,message,from,created_time}" });
  const items = slice.flatMap(({ id, updated }) => {
    const post = details[id];
    const latest = post?.comments?.data?.[0];
    const total = post?.comments?.summary?.total_count ?? 0;
    if (!post || !latest || total === 0) return [];
    const text = post.message || "";
    return [{ id, handle: resourceHandle(ctx, "post", id), title: (text || "منشور بدون نص").slice(0, 120), text,
      time: latest.created_time || new Date(updated).toISOString(), url: safeSocialUrl(post.permalink_url),
      outgoing: own(ctx, latest.from?.id), commentCount: total,
      preview: `${own(ctx, latest.from?.id) ? "أنت" : latest.from?.name || UNKNOWN_AUTHOR}: ${latest.message || "[تعليق غير نصي]"}` }];
  });
  return { items, after: offset + POSTS_PAGE < posts.length ? `offset:${offset + POSTS_PAGE}` : null };
}

export async function listInboxPosts(ctx: InboxContext, after?: string, adPostIds?: string[]): Promise<InboxPage> {
  if (ctx.platform === "facebook") return listFacebookPostsByActivity(ctx, after, adPostIds);
  const instagram = ctx.platform === "instagram";
  const res = await graphGet<GraphPage<{ id: string; message?: string; caption?: string;
    created_time?: string; timestamp?: string; permalink?: string; permalink_url?: string }>>(
    `${path(instagram ? ctx.igId! : ctx.pageId)}/${instagram ? "media" : "posts"}`, ctx.token,
    { ...params(after), fields: instagram ? "id,caption,timestamp,permalink" : "id,message,created_time,permalink_url" });
  return { items: (res.data ?? []).map(p => ({ id: p.id, handle: resourceHandle(ctx, "post", p.id),
    title: (p.caption || p.message || "منشور بدون نص").slice(0, 120), text: p.caption || p.message || "",
    time: p.timestamp || p.created_time || "", url: safeSocialUrl(p.permalink || p.permalink_url) })), after: next(res) };
}

function commentFields(ctx: InboxContext, withExtras: boolean) {
  // Extras: hidden flag and the replies' authors (to know whether the Page answered).
  return ctx.platform === "instagram" ? `id,text,username,from,timestamp${withExtras ? ",hidden,replies.limit(25){from}" : ""}`
    : `id,message,from,created_time${withExtras ? ",is_hidden,private_reply_conversation,comments.limit(25){from}" : ""}`;
}

export async function readInboxComments(ctx: InboxContext, handle: string, replies: boolean, after?: string): Promise<InboxPage> {
  const id = resourceId(ctx, replies ? "comment" : "post", handle);
  const edge = replies && ctx.platform === "instagram" ? "replies" : "comments";
  const read = (withHidden: boolean) => graphGet<GraphPage<Comment>>(`${path(id)}/${edge}`, ctx.token,
    { ...params(after), fields: commentFields(ctx, withHidden),
      order: ctx.platform === "facebook" ? "reverse_chronological" : undefined,
      filter: ctx.platform === "facebook" && !replies ? "toplevel" : undefined });
  // The extras are a nicety: if Meta rejects a field, still list the comments.
  const res = await read(true).catch(error => {
    if (error instanceof GraphError && error.code === 100) return read(false);
    throw error;
  });
  return { items: (res.data ?? []).map(c => ({ id: c.id, handle: resourceHandle(ctx, "comment", c.id),
    authorId: c.from?.id, authorUsername: c.username || c.from?.username,
    title: c.from?.name || c.username || c.from?.username || UNKNOWN_AUTHOR, text: c.text || c.message || "[تعليق غير نصي]",
    time: c.timestamp || c.created_time || "", outgoing: own(ctx, c.from?.id),
    ...(own(ctx, c.from?.id) ? {} : { intent: classifyComment(c.text || c.message || "") }),
    ...([...(c.comments?.data ?? []), ...(c.replies?.data ?? [])].some(reply => own(ctx, reply.from?.id)) || c.private_reply_conversation
      ? { answered: true } : {}),
    ...(c.is_hidden || c.hidden ? { hidden: true } : {}) })), after: next(res) };
}

/** One comment, read from Meta (never from the browser), for registering an order from it. */
export async function readInboxComment(ctx: InboxContext, handle: string): Promise<InboxItem & { commentId: string }> {
  const id = resourceId(ctx, "comment", handle);
  const c = await graphGet<Comment>(path(id), ctx.token, { fields: commentFields(ctx, false) });
  return { id: c.id, commentId: id, handle, title: c.from?.name || c.username || c.from?.username || UNKNOWN_AUTHOR,
    text: c.text || c.message || "", time: c.timestamp || c.created_time || "", outgoing: own(ctx, c.from?.id) };
}

/** A comment the reply tools must not answer; the bulk run skips it and continues. */
export class CommentReplySkip extends Error {
  constructor(public reason: "replied" | "private-sent" | "private-unavailable" | "private-rejected", message: string) { super(message); }
}

/** Whether the Page already replied under this comment (checked on the server before a bulk reply). */
export async function pageRepliedToComment(ctx: InboxContext, handle: string) {
  const id = resourceId(ctx, "comment", handle);
  const res = await graphGet<GraphPage<Comment>>(`${path(id)}/${ctx.platform === "instagram" ? "replies" : "comments"}`, ctx.token,
    { fields: ctx.platform === "instagram" ? "id,from,username" : "id,from", limit: "50" });
  return (res.data ?? []).some(reply => own(ctx, reply.from?.id));
}

const RATE_LIMIT_CODES = [4, 17, 32, 368, 613];

/**
 * Private reply to a comment (one per comment, within 7 days, text only).
 * Facebook says up front whether it is allowed; Instagram is just attempted.
 * A rejection for this comment becomes a skip; rate limits and unknown outcomes throw.
 */
export async function sendCommentPrivateReply(ctx: InboxContext, handle: string, text: string) {
  const id = resourceId(ctx, "comment", handle);
  if (ctx.platform === "facebook") {
    const source = await graphGet<{ can_reply_privately?: boolean; private_reply_conversation?: { id?: string } }>(
      path(id), ctx.token, { fields: "can_reply_privately,private_reply_conversation" });
    if (source.private_reply_conversation) throw new CommentReplySkip("private-sent", "سبق إرسال رسالة خاصة لصاحب هذا التعليق.");
    if (source.can_reply_privately !== true) throw new CommentReplySkip("private-unavailable", "فيسبوك لا يسمح برسالة خاصة على هذا التعليق (قد يكون أقدم من 7 أيام).");
  }
  let sent: { message_id?: string };
  try {
    sent = await graphPost<{ message_id?: string }>(`${path(ctx.pageId)}/messages`, ctx.token,
      { recipient: { comment_id: id }, message: { text } });
  } catch (error) {
    // Missing permission (10, 200) or expired login (190) affects every comment: stop, don't skip.
    if (error instanceof GraphError && !error.outcomeUnknown && !RATE_LIMIT_CODES.includes(error.code ?? 0) && ![10, 190, 200].includes(error.code ?? 0))
      throw new CommentReplySkip("private-rejected", `رفضت Meta الرسالة الخاصة على هذا التعليق (رمز ${error.code ?? error.status}).`);
    throw error;
  }
  if (!sent?.message_id) throw new Error("لم تؤكد Meta إرسال الرسالة الخاصة؛ تحقّق من المحادثات قبل إعادة المحاولة");
  return sent.message_id;
}

/**
 * Reply to a comment publicly and/or privately. The private message goes first:
 * if it is not possible, nothing public is posted (so "we messaged you" is never
 * a lie). If the private message went out but the public reply failed, the
 * result says so and only the public part may be retried.
 */
export async function replyToComment(ctx: InboxContext, handle: string,
  input: { publicText: string; privateText: string; skipIfReplied: boolean; privateRequired?: boolean }) {
  const { publicText, privateText } = input;
  try {
    if (input.skipIfReplied && await pageRepliedToComment(ctx, handle))
      throw new CommentReplySkip("replied", "سبق الرد على هذا التعليق من الصفحة.");
    let privateId: string | undefined;
    let privateSkipped: string | undefined;
    try {
      privateId = privateText ? await sendCommentPrivateReply(ctx, handle, privateText) : undefined;
    } catch (error) {
      // A public reply that stands on its own still goes out when only the private message is refused.
      if (!(error instanceof CommentReplySkip) || input.privateRequired !== false || !publicText) throw error;
      privateSkipped = error.message;
    }
    if (!publicText) return { status: "sent" as const, privateId };
    if (privateSkipped) return { status: "sent" as const, publicId: await sendInboxComment(ctx, handle, publicText), privateSkipped };
    try {
      return { status: "sent" as const, privateId, publicId: await sendInboxComment(ctx, handle, publicText) };
    } catch (error) {
      if (!privateId) throw error;
      return { status: "partial" as const, privateId, message: "أُرسلت الرسالة الخاصة لكن تعذّر نشر الرد العلني؛ أعد نشره من مربع الكتابة." };
    }
  } catch (error) {
    if (error instanceof CommentReplySkip) return { status: "skipped" as const, reason: error.reason, message: error.message };
    throw error;
  }
}

/** The post's own text, read from Meta (used to find storefront links in it). */
export async function readInboxPostText(ctx: InboxContext, handle: string) {
  const id = resourceId(ctx, "post", handle);
  type Post = { id: string; message?: string; caption?: string; call_to_action?: { value?: { link?: string } } };
  const read = (fields: string) => graphGet<Post>(path(id), ctx.token, { fields });
  // Ads keep the landing-page link in their button (call_to_action), not in the text.
  const post = ctx.platform === "instagram" ? await read("id,caption")
    : await read("id,message,call_to_action").catch(error => {
      if (error instanceof GraphError && error.code === 100) return read("id,message");
      throw error;
    });
  const link = safeSocialUrl(post.call_to_action?.value?.link);
  return { id, text: [post.caption || post.message || "", link].filter(Boolean).join("\n") };
}

export type CommentModeration = "hide" | "unhide" | "delete";

/** Hide, show or delete a comment the Page listed. Facebook uses `is_hidden`, Instagram `hide`. */
export async function moderateInboxComment(ctx: InboxContext, handle: string, action: CommentModeration) {
  const id = resourceId(ctx, "comment", handle);
  const res = action === "delete"
    ? await graphDelete<{ success?: boolean }>(path(id), ctx.token)
    : await graphPost<{ success?: boolean }>(path(id), ctx.token,
      ctx.platform === "instagram" ? { hide: action === "hide" } : { is_hidden: action === "hide" });
  if (res?.success !== true) throw new Error("لم تؤكد Meta تنفيذ الإجراء؛ حدّث التعليقات للتحقق");
}

/**
 * Block a comment's author from the Facebook Page (no commenting or messaging).
 * The author is read from Meta on the server, never taken from the browser.
 * Instagram offers no block API.
 */
export async function blockInboxCommentAuthor(ctx: InboxContext, handle: string) {
  if (ctx.platform !== "facebook") throw new Error("إنستغرام لا يتيح الحظر عبر التطبيقات؛ احظر الحساب من تطبيق إنستغرام. يمكنك إخفاء تعليقه أو حذفه من هنا.");
  const id = resourceId(ctx, "comment", handle);
  const comment = await graphGet<{ from?: Person }>(path(id), ctx.token, { fields: "from" });
  const author = comment.from?.id;
  if (!author) throw new Error("لم تُظهر Meta هوية صاحب التعليق؛ احظره من Meta Business Suite.");
  if (own(ctx, author)) throw new Error("هذا تعليق الصفحة نفسها");
  const block = (body: Record<string, unknown>) => graphPost<Record<string, boolean>>(`${path(ctx.pageId)}/blocked`, ctx.token, body);
  let res: Record<string, boolean>;
  try {
    // Meta does not document which ID type a comment author has; try `user`, then `psid`.
    res = await block({ user: [author] }).catch(error => {
      if (error instanceof GraphError && error.code === 100) return block({ psid: [author] });
      throw error;
    });
  } catch (error) {
    if (error instanceof GraphError && (error.code === 210 || error.code === 100))
      throw new Error("رفضت Meta حظر هذا الحساب عبر التطبيق؛ احظره من Meta Business Suite. يمكنك حذف تعليقه من هنا.");
    if (error instanceof GraphError && error.code === 3802) throw new Error("أُلغي حظر هذا الشخص مؤخراً؛ تمنع Meta إعادة حظره فوراً. حاول لاحقاً.");
    if (error instanceof GraphError && error.code === 3801) throw new Error("وصلت الصفحة إلى الحد الأقصى للمحظورين لدى Meta.");
    throw error;
  }
  if (!Object.values(res ?? {}).some(Boolean)) throw new Error("لم تؤكد Meta الحظر؛ راجع قائمة المحظورين في إعدادات الصفحة.");
}

export async function sendInboxComment(ctx: InboxContext, handle: string, text: string) {
  const id = resourceId(ctx, "comment", handle);
  const res = await graphPost<{ id?: string }>(`${path(id)}/${ctx.platform === "instagram" ? "replies" : "comments"}`,
    ctx.token, { message: text });
  if (!res.id) throw new Error("لم تؤكد Meta نشر الرد؛ تحقّق من التعليق قبل إعادة المحاولة");
  return res.id;
}
