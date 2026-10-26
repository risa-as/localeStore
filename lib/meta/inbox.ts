import crypto from "crypto";
import { graphGet, graphPost, GraphError } from "./graph";
import type { InboxMedia } from "./inbox-media";
import type { InboxProduct } from "./inbox-tools";
import type { DeliveryStatus } from "./inbox-delivery";

export type SocialPlatform = "facebook" | "instagram";
export type InboxContext = {
  pageId: string; platform: SocialPlatform; token: string;
  igId?: string; secret: string; userId: string;
};
export type InboxItem = {
  id: string; handle: string; title: string; text: string; time: string;
  outgoing?: boolean; unread?: number; url?: string; lastMessageId?: string;
  system?: "comment-origin"; commentUrl?: string;
  deliveryStatus?: DeliveryStatus;
  sendError?: string;
  authorId?: string;
  authorUsername?: string;
  attachments?: { name: string; url: string; kind?: "image" | "sticker" | "audio" | "video" | "file"; width?: number; height?: number }[];
};
export type InboxPage = { items: InboxItem[]; after: string | null };
export type InboxOrigin = { comment: InboxItem; post: InboxItem | null; commentUnavailable?: boolean; products?: InboxProduct[] };
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
  return { text: text.replace(/(?:عرض التعليق|View comment)\s*\(https?:\/\/[^\s<>()]+\)/iu, "").trim(), commentUrl };
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

export function replyWindow(ctx: InboxContext, messages: Message[], now = Date.now()) {
  const notices = ctx.platform === "facebook" ? messages.filter(m => commentOriginNotice(m.message)) : [];
  const originAt = Math.max(...notices.map(m => Date.parse(m.created_time || "")).filter(Number.isFinite), -Infinity);
  const incoming = messages.filter(m => m.from?.id && !own(ctx, m.from.id) &&
      !(ctx.platform === "facebook" && commentOriginNotice(m.message)) && Date.parse(m.created_time || "") > originAt)
    .map(m => ({ recipient: m.from!.id, at: Date.parse(m.created_time || "") }))
    .filter(m => Number.isFinite(m.at) && m.at <= now)
    .sort((a, b) => b.at - a.at)[0];
  const expires = incoming ? incoming.at + 86400000 : null;
  return { recipient: incoming?.recipient ?? null, expiresAt: expires ? new Date(expires).toISOString() : null,
    canReply: !!expires && expires > now, reason: !incoming && notices.length ? "comment-origin" as const : undefined };
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

export async function readInboxMessages(ctx: InboxContext, handle: string, after?: string) {
  const id = resourceId(ctx, "conversation", handle);
  const res = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { ...params(after), fields: messageFields(ctx) });
  let recipientId = (res.data ?? []).find(m => m.from?.id && !own(ctx, m.from.id))?.from?.id;
  if (!recipientId && res.data?.some(m => own(ctx, m.from?.id))) {
    const conversation = await graphGet<{ participants?: { data?: Person[] } }>(path(id), ctx.token, { fields: "participants" });
    recipientId = conversation.participants?.data?.find(person => !own(ctx, person.id))?.id;
  }
  // Older pagination pages must never extend the reply window.
  return { items: (res.data ?? []).map(m => messageItem(ctx, m)), after: next(res),
    recipientId,
    window: after ? null : replyWindow(ctx, res.data ?? []),
    latestMessageId: after ? undefined : latestMessage(res.data ?? [])?.id };
}

/** Resolve the source from Meta history, never from a client-supplied URL or ID. */
export async function readInboxOrigin(ctx: InboxContext, handle: string, messageId?: string): Promise<InboxOrigin | null> {
  const id = resourceId(ctx, "conversation", handle);
  if (ctx.platform !== "facebook") return null;
  const history = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { fields: "id,message,from,created_time", limit: "100" });
  const link = (history.data || []).filter(message => !messageId || message.id === messageId)
    .map(message => commentOriginNotice(message.message)?.commentUrl).find(Boolean);
  if (!link) return null;
  const sourceUrl = new URL(link);
  const commentId = sourceUrl.searchParams.get("comment_id");
  if (!commentId || !/^\d{1,100}$/.test(commentId)) return null;
  let source: Comment & { object?: { id?: string } } = { id: commentId };
  let commentUnavailable = false;
  try {
    source = await graphGet<typeof source>(path(commentId), ctx.token, { fields: "id,message,from,created_time,object{id}" });
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
  return { comment, post, ...(commentUnavailable ? { commentUnavailable: true } : {}) };
}

/** Only acknowledge the message the administrator actually loaded, never a newer arrival. */
export async function markInboxConversationRead(ctx: InboxContext, handle: string, observedMessageId: string) {
  const id = resourceId(ctx, "conversation", handle);
  if (typeof observedMessageId !== "string" || !observedMessageId || observedMessageId.length > 2000)
    throw new Error("مرجع الرسالة غير صالح؛ حدّث المحادثة");
  const res = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { fields: "id,message,from,created_time", limit: "100" });
  if (latestMessage(res.data ?? [])?.id !== observedMessageId) return { marked: false };
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

export async function sendInboxMessage(ctx: InboxContext, handle: string, text: string) {
  return sendInboxContent(ctx, handle, { text });
}

export async function sendInboxMediaMessage(ctx: InboxContext, handle: string, media: InboxMedia) {
  return sendInboxContent(ctx, handle, { attachment: { type: media.kind, payload: { url: media.url } } });
}

async function sendInboxContent(ctx: InboxContext, handle: string, message: Record<string, unknown>) {
  const id = resourceId(ctx, "conversation", handle);
  // Re-read on the server at send time; never accept a client recipient/window.
  const res = await graphGet<GraphPage<Message>>(`${path(id)}/messages`, ctx.token,
    { fields: "id,message,from,created_time", limit: "100" });
  const window = replyWindow(ctx, res.data ?? []);
  if (!window.canReply || !window.recipient)
    throw new Error("نافذة الرد العادي مغلقة أو لم نجد رسالة واردة حديثة. افتح المحادثة في Meta Business Suite.");
  const sent = await graphPost<{ message_id?: string }>(`${path(ctx.pageId)}/messages`, ctx.token,
    { recipient: { id: window.recipient }, messaging_type: "RESPONSE", message });
  if (!sent?.message_id) throw new Error("لم تؤكد Meta إرسال الرسالة؛ تحقّق من المحادثة قبل إعادة المحاولة");
  return { id: sent.message_id, previousMessageIds: (res.data ?? []).map(message => message.id) };
}

export async function listInboxPosts(ctx: InboxContext, after?: string): Promise<InboxPage> {
  const instagram = ctx.platform === "instagram";
  const res = await graphGet<GraphPage<{ id: string; message?: string; caption?: string;
    created_time?: string; timestamp?: string; permalink?: string; permalink_url?: string }>>(
    `${path(instagram ? ctx.igId! : ctx.pageId)}/${instagram ? "media" : "posts"}`, ctx.token,
    { ...params(after), fields: instagram ? "id,caption,timestamp,permalink" : "id,message,created_time,permalink_url" });
  return { items: (res.data ?? []).map(p => ({ id: p.id, handle: resourceHandle(ctx, "post", p.id),
    title: (p.caption || p.message || "منشور بدون نص").slice(0, 120), text: p.caption || p.message || "",
    time: p.timestamp || p.created_time || "", url: safeSocialUrl(p.permalink || p.permalink_url) })), after: next(res) };
}

function commentFields(ctx: InboxContext) {
  return ctx.platform === "instagram" ? "id,text,username,from,timestamp" : "id,message,from,created_time";
}

export async function readInboxComments(ctx: InboxContext, handle: string, replies: boolean, after?: string): Promise<InboxPage> {
  const id = resourceId(ctx, replies ? "comment" : "post", handle);
  const edge = replies && ctx.platform === "instagram" ? "replies" : "comments";
  const res = await graphGet<GraphPage<Comment>>(`${path(id)}/${edge}`, ctx.token,
    { ...params(after), fields: commentFields(ctx),
      order: ctx.platform === "facebook" ? "reverse_chronological" : undefined,
      filter: ctx.platform === "facebook" && !replies ? "toplevel" : undefined });
  return { items: (res.data ?? []).map(c => ({ id: c.id, handle: resourceHandle(ctx, "comment", c.id),
    authorId: c.from?.id, authorUsername: c.username || c.from?.username,
    title: c.from?.name || c.username || c.from?.username || "زبون", text: c.text || c.message || "[تعليق غير نصي]",
    time: c.timestamp || c.created_time || "", outgoing: own(ctx, c.from?.id) })), after: next(res) };
}

export async function sendInboxComment(ctx: InboxContext, handle: string, text: string) {
  const id = resourceId(ctx, "comment", handle);
  const res = await graphPost<{ id?: string }>(`${path(id)}/${ctx.platform === "instagram" ? "replies" : "comments"}`,
    ctx.token, { message: text });
  if (!res.id) throw new Error("لم تؤكد Meta نشر الرد؛ تحقّق من التعليق قبل إعادة المحاولة");
  return res.id;
}
