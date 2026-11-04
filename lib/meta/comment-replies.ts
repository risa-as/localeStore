import { expandQuickReply, type InboxProduct } from "./inbox-tools";

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
  /** Public reply. Several variants may be separated by a line containing only --- */
  publicText: string;
  /** Private message to the commenter, sent BEFORE the public reply. Empty = none. */
  privateText: string;
};

export const MAX_COMMENT_REPLIES = 20;

export const DEFAULT_COMMENT_REPLIES: CommentReply[] = [
  { id: "price-private", label: "السعر بالخاص", keywords: ["سعر", "اسعار", "بكم", "شكد", "كم السعر", "price"],
    publicText: "راسلناك بالخاص {الاسم} 🌷\n---\nوصلتك رسالة بالخاص بكل التفاصيل 🌷\n---\nتم الرد بالخاص، نورتنا 🌷",
    privateText: "أهلاً {الاسم} 🌷\n{المنتج}\nالسعر: {السعر}\nالتوصيل: {التوصيل}\nللطلب من هنا: {الرابط}" },
  { id: "price-public", label: "السعر علني", keywords: [],
    publicText: "سعر {المنتج} {السعر} والتوصيل {التوصيل} 🌷\nللطلب: {الرابط}", privateText: "" },
  { id: "order-how", label: "طريقة الطلب", keywords: ["اطلب", "طلب", "احجز", "حجز", "وين"],
    publicText: "تكدر تطلب {المنتج} من هنا: {الرابط}\nأو أرسل لنا رقمك وعنوانك بالخاص 🌷", privateText: "" },
  { id: "thanks", label: "شكراً", keywords: ["شكرا", "تسلم", "حلو", "روعه"],
    publicText: "شكراً {الاسم} 🌷\n---\nتسلم {الاسم}، نورتنا 🌷", privateText: "" },
];

const strings = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= 30 && value.every(item => typeof item === "string" && item.length <= max);

export function decodeCommentReplies(raw: string | null): CommentReply[] {
  try {
    const saved: unknown = JSON.parse(raw || "null");
    if (Array.isArray(saved) && saved.length <= MAX_COMMENT_REPLIES && saved.every(item => item &&
      typeof item.id === "string" && typeof item.label === "string" && item.label.length <= 40 &&
      strings(item.keywords, 40) && typeof item.publicText === "string" && item.publicText.length <= 3000 &&
      typeof item.privateText === "string" && item.privateText.length <= 1000)) return saved;
  } catch { /* Fall back to the defaults when storage is empty or malformed. */ }
  return DEFAULT_COMMENT_REPLIES.map(reply => ({ ...reply, keywords: [...reply.keywords] }));
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
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ").trim();
}

const words = (text: string) => normalizeArabic(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// Attached Arabic prefixes: «السعر», «بالسعر», «وبكم» still match «سعر» / «بكم».
const PREFIXES = ["وال", "بال", "فال", "كال", "ال", "لل", "و", "ب", "ف", "ل"];
const wordStartsWith = (word: string, keyword: string) => word.startsWith(keyword) ||
  PREFIXES.some(prefix => word.length > prefix.length && word.startsWith(prefix) && word.slice(prefix.length).startsWith(keyword));

/**
 * The first reply with a keyword at the START of a word in the comment, or null.
 * Matching inside words is avoided on purpose: «كم» must not match «عليكم».
 */
export function matchCommentReply(text: string, replies: CommentReply[]) {
  const comment = words(text);
  if (!comment.length) return null;
  return replies.find(reply => reply.keywords.some(keyword => {
    const parts = words(keyword);
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

/** Fills placeholders; `missing` lists fields that need a product (or are unknown). */
export function expandCommentReply(reply: CommentReply, name: string, product: InboxProduct | null, index = 0) {
  const publicPart = expandQuickReply(pickVariant(reply.publicText, index), name, product);
  const privatePart = expandQuickReply(reply.privateText.trim(), name, product);
  return { publicText: publicPart.text, privateText: privatePart.text,
    missing: [...new Set([...publicPart.missing, ...privatePart.missing])] };
}
