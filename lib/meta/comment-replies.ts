import { expandQuickReply, type InboxProduct } from "./inbox-tools";
import type { CommentIntent } from "./comment-intent";
import { ORDER_FIELDS, usesOrderFields } from "./order-reply";

/**
 * A customizable comment reply. One definition drives all comment tools:
 * - a one-click button under each comment
 * - keyword suggestion when a comment is opened
 * - bulk reply to every loaded comment that matches the keywords
 * - an optional private message sent with the public reply
 */
export type CommentReply = {
  id: string;
  label: string;
  /** Matched against the comment text after Arabic normalization; empty = button only. */
  keywords: string[];
  /** Comment kinds this reply is suggested for (and bulk-sent to), e.g. every price question. */
  intents: CommentIntent[];
  /** Public reply. Several variants may be separated by a line containing only --- */
  publicText: string;
  /** Private message to the commenter, sent BEFORE the public reply. Empty = none. */
  privateText: string;
  /**
   * true: post the public reply only if the private message went out (for «راسلناك بالخاص»).
   * false: the public reply stands on its own and is posted anyway.
   */
  privateRequired: boolean;
};

export const MAX_COMMENT_REPLIES = 20;

/**
 * Written from the store's real comments: most ask the price (السعر، شكد، بيش),
 * many leave a phone and address, and the Page's own habit is «الاسم 60 الف مع التوصيل».
 * Several variants per reply so bulk replies are not identical.
 */
export const DEFAULT_COMMENT_REPLIES: CommentReply[] = [
  { id: "price-public", label: "السعر", keywords: [], intents: ["price"], privateRequired: false,
    publicText: "{الاسم} {المنتج}\nالسعر {السعر} والتوصيل {التوصيل}\n{العروض}\nللحجز اكتب رقم الهاتف والعنوان (المحافظة والمنطقة) 🌷\n---\n"
      + "أهلاً {الاسم} 🌷 سعر {المنتج} {السعر} + التوصيل {التوصيل}\n{العروض}\nاكتب رقمك وعنوانك ونثبت طلبك\n---\n"
      + "{الاسم} {المنتج} بـ {السعر} والتوصيل {التوصيل} 🌷\n{العروض}\nللحجز أرسل رقم هاتفك وعنوانك",
    privateText: "أهلاً {الاسم} 🌷\n{المنتج}\nالسعر: {السعر}\nالتوصيل: {التوصيل}\n{العروض}\n\nللحجز أرسل رقم هاتفك وعنوانك (المحافظة والمنطقة وأقرب نقطة دالة) هنا 🌷" },
  { id: "price-private", label: "السعر بالخاص", keywords: [], intents: [], privateRequired: true,
    publicText: "{الاسم} راسلناك بالخاص بكل التفاصيل 🌷\n---\n{الاسم} وصلتك رسالة بالخاص 🌷\n---\nتم الرد بالخاص {الاسم}، نورتنا 🌷",
    privateText: "أهلاً {الاسم} 🌷\n{المنتج}\nالسعر: {السعر}\nالتوصيل: {التوصيل}\n{العروض}\n\nللحجز أرسل رقم هاتفك وعنوانك هنا، أو اطلب مباشرة من الرابط:\n{الرابط}" },
  { id: "order-received", label: "تم الحجز", keywords: [], intents: ["order"], privateRequired: false,
    publicText: "{الاسم} تم الحجز ✅ وسوف يصل الطلب لك خلال 24 ساعة 🌷\n---\n"
      + "تم الحجز {الاسم} ✅ طلبك يوصلك خلال 24 ساعة إن شاء الله 🌷",
    privateText: "تم الحجز ✅\n\nتفاصيل طلبك:\nالمنتج: {منتجات الطلب}\nالسعر مع التوصيل: {مجموع الطلب}\nالعنوان: {العنوان}\nرقم الهاتف: {رقم الهاتف}\n\n"
      + "سوف يصل الطلب لك خلال 24 ساعة إن شاء الله 🌷\nإذا كان هناك أي خطأ في المعلومات راسلنا هنا." },
  { id: "booking-how", label: "طريقة الحجز", keywords: [], intents: ["booking"], privateRequired: false,
    publicText: "{الاسم} حاضرين 🌷 {المنتج}\nالسعر {السعر} والتوصيل {التوصيل}\n{العروض}\nاكتب رقم هاتفك والعنوان (المحافظة والمنطقة) ونثبت طلبك\n---\n"
      + "{الاسم} {المنتج} بـ {السعر} والتوصيل {التوصيل} 🌷\n{العروض}\nللحجز أرسل رقمك وعنوانك بتعليق أو بالخاص",
    privateText: "أهلاً {الاسم} 🌷\n{المنتج}\nالسعر: {السعر}\nالتوصيل: {التوصيل}\n{العروض}\n\nلتثبيت حجزك أرسل رقم هاتفك وعنوانك (المحافظة والمنطقة وأقرب نقطة دالة) هنا 🌷" },
  { id: "offers", label: "العروض والأسعار الثابتة", keywords: [], intents: ["bargain"], privateText: "", privateRequired: false,
    publicText: "{الاسم} الأسعار ثابتة 🌷 سعر القطعة {السعر} والتوصيل {التوصيل}\n{العروض}\nللحجز اكتب رقمك وعنوانك" },
  { id: "delivery", label: "التوصيل", keywords: [], intents: ["delivery"], privateText: "", privateRequired: false,
    publicText: "{الاسم} نوصل لكل محافظات العراق 🚚 التوصيل {التوصيل} ويوصلك خلال 48 ساعة إن شاء الله، والدفع عند الاستلام 🌷\nللحجز اكتب رقمك وعنوانك" },
  { id: "followup", label: "متابعة الطلب", keywords: [], intents: ["followup"], privateText: "", privateRequired: false,
    publicText: "{الاسم} نعتذر عن التأخير 🙏 راسلنا برقم هاتفك بالخاص حتى نتابع طلبك فوراً" },
  { id: "greeting", label: "رد السلام", keywords: [], intents: ["greeting"], privateText: "", privateRequired: false,
    publicText: "وعليكم السلام {الاسم} 🌷 تفضل، شلون نكدر نخدمك؟" },
  { id: "thanks", label: "شكراً", keywords: [], intents: ["praise"], privateText: "", privateRequired: false,
    publicText: "شكراً {الاسم} 🌷 نورتنا\n---\nتسلم {الاسم} 🌷\n---\nالله يحفظك {الاسم} 🌷" },
];

const defaults = () => DEFAULT_COMMENT_REPLIES.map(reply => ({ ...reply, keywords: [...reply.keywords], intents: [...reply.intents] }));

/** Replace the suggested replies with the current ones, keep the admin's own replies. */
export function restoreDefaultReplies(replies: CommentReply[]) {
  const ids = new Set(DEFAULT_COMMENT_REPLIES.map(reply => reply.id));
  // Older suggested replies that the new set replaces.
  for (const old of ["order-how"]) ids.add(old);
  return [...defaults(), ...replies.filter(reply => !ids.has(reply.id))].slice(0, MAX_COMMENT_REPLIES);
}

const strings = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= 30 && value.every(item => typeof item === "string" && item.length <= max);

export function decodeCommentReplies(raw: string | null): CommentReply[] {
  try {
    const saved: unknown = JSON.parse(raw || "null");
    if (Array.isArray(saved) && saved.length <= MAX_COMMENT_REPLIES && saved.every(item => item &&
      typeof item.id === "string" && typeof item.label === "string" && item.label.length <= 40 &&
      strings(item.keywords, 40) && typeof item.publicText === "string" && item.publicText.length <= 3000 &&
      typeof item.privateText === "string" && item.privateText.length <= 1000 &&
      (item.intents === undefined || strings(item.intents, 20))))
      // Replies saved before intents existed have none; before privateRequired, a private part always gated the public one.
      return saved.map(item => ({ ...item, intents: Array.isArray(item.intents) ? item.intents : [],
        privateRequired: typeof item.privateRequired === "boolean" ? item.privateRequired : true }));
  } catch { /* Fall back to the defaults when storage is empty or malformed. */ }
  return defaults();
}

/**
 * Folds the spellings customers actually type so keywords match:
 * diacritics and tatweel removed, أ/إ/آ → ا, ى → ي, ة → ه, Persian ی/ک → ي/ك.
 */
export function normalizeArabic(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[یې]/g, "ي").replace(/ک/g, "ك")
    // Iraqi/Kurdish letters: «شگد» is «شكد».
    .replace(/گ/g, "ك").replace(/چ/g, "ج").replace(/پ/g, "ب").replace(/ڤ/g, "ف").replace(/ڕ/g, "ر")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ").trim();
}

export const commentWords = (text: string) => normalizeArabic(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// Attached Arabic prefixes: «السعر», «بالسعر», «وبكم» still match «سعر» / «بكم».
const PREFIXES = ["وال", "بال", "فال", "كال", "ال", "لل", "و", "ب", "ف", "ل"];
export const wordStartsWith = (word: string, keyword: string) => word.startsWith(keyword) ||
  PREFIXES.some(prefix => word.length > prefix.length && word.startsWith(prefix) && word.slice(prefix.length).startsWith(keyword));

/**
 * The reply to suggest for a comment: first one made for its intent (price,
 * order…), otherwise the first with a keyword at the START of a word in it.
 * Matching inside words is avoided on purpose: «كم» must not match «عليكم».
 */
export function matchCommentReply(text: string, replies: CommentReply[], intent?: CommentIntent) {
  const byIntent = intent ? replies.find(reply => reply.intents.includes(intent)) : undefined;
  if (byIntent) return byIntent;
  const comment = commentWords(text);
  if (!comment.length) return null;
  return replies.find(reply => reply.keywords.some(keyword => {
    const parts = commentWords(keyword);
    return parts.length > 0 && comment.some((_, start) =>
      parts.every((part, offset) => start + offset < comment.length && wordStartsWith(comment[start + offset], part)));
  })) || null;
}

export function replyVariants(text: string) {
  return text.split(/\r?\n[ \t]*---[ \t]*(?:\r?\n|$)/).map(part => part.trim()).filter(Boolean);
}

/** Rotates variants by index so bulk replies are not identical. */
export function pickVariant(text: string, index: number) {
  const variants = replyVariants(text);
  return variants.length ? variants[((index % variants.length) + variants.length) % variants.length] : "";
}

/** The title the inbox shows when Meta does not return the commenter's name. */
export const UNKNOWN_AUTHOR = "زبون";

/** Fills {الاسم} with the commenter's name, or leaves it out (with tidy spacing) when unknown. */
function fillName(text: string, name: string) {
  const known = name.trim() && name.trim() !== UNKNOWN_AUTHOR ? name.trim() : "";
  const filled = text.replace(/\{\s*الاسم\s*\}/g, known);
  if (known) return filled;
  return filled.split("\n").map(line => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([،,.!؟?:])/g, "$1")
    .replace(/^[ \t]*[،,][ \t]*/, "").trim()).join("\n");
}

/** Fills placeholders; `missing` lists fields that need a product (or are unknown). */
export function expandCommentReply(reply: CommentReply, name: string, product: InboxProduct | null, index = 0) {
  const publicPart = expandQuickReply(fillName(pickVariant(reply.publicText, index), name), name, product);
  const privatePart = expandQuickReply(fillName(reply.privateText.trim(), name), name, product);
  // An empty {العروض} must not leave a gap of blank lines.
  const tidy = (text: string) => text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").replace(/(^|\n)[ \t]*\n(?=[^\n]*$)/, "$1").trim();
  // Order fields are filled on the server from the registered order, so they are not "missing" here.
  return { publicText: tidy(publicPart.text), privateText: tidy(privatePart.text),
    missing: [...new Set([...publicPart.missing, ...privatePart.missing])].filter(field => !ORDER_FIELDS.includes(field)),
    needsOrder: usesOrderFields(reply.publicText) || usesOrderFields(reply.privateText) };
}
