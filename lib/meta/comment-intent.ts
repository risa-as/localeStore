import { commentWords, normalizeArabic, wordStartsWith } from "./comment-replies";

/**
 * What a comment is asking for, so the inbox can filter comments and suggest
 * the right reply. Built from ~1,700 real comments on this store's posts:
 * most ask the price, many leave a phone number and address (an order),
 * and questions about car compatibility or size need a person to answer.
 */
export type CommentIntent = "order" | "followup" | "question" | "complaint" | "bargain" | "price" | "booking" | "delivery" | "praise" | "greeting" | "other";

export const COMMENT_INTENTS: { value: CommentIntent; label: string; hint: string }[] = [
  { value: "order", label: "طلبات برقم هاتف", hint: "كتب رقم الهاتف أو العنوان — سجّل الطلب" },
  { value: "price", label: "يسأل عن السعر", hint: "السعر، شكد، بيش، كم السعر" },
  { value: "booking", label: "يريد الحجز", hint: "اريد وحدة، احجز، رايد — بلا رقم" },
  { value: "delivery", label: "التوصيل والمكان", hint: "توصيل، كم يوم يوصل، وين مكانكم" },
  { value: "question", label: "سؤال يحتاج رداً منك", hint: "ترهم على سيارة؟ القياس؟ كاملة لو بس القاعدة؟" },
  { value: "followup", label: "متابعة طلب سابق", hint: "حجزت وما وصل، وين الطلبية — راجع طلبه" },
  { value: "bargain", label: "يساوم أو يريد عدة قطع", hint: "اذا ب15 مع التوصيل أحجز، رايد 2 قطعة" },
  { value: "complaint", label: "تسقيط أو تبخيس للمنتج", hint: "غالية، لكيته أرخص، ما تسوه، نصب، فاشل — يمكن إخفاؤها أو حذفها كلها" },
  { value: "praise", label: "شكر وثناء", hint: "روعة، عاشت ايدك" },
  { value: "greeting", label: "سلام فقط", hint: "السلام عليكم" },
  { value: "other", label: "أخرى وإشارات", hint: "إشارة لصديق أو نص غير مفهوم" },
];

// Keyword sets are in normalized form (see normalizeArabic): ة→ه, أ/إ/آ→ا, ى→ي, گ→ك.
const PRICE_PREFIX = ["سعر", "اسعار", "price", "تكلف", "جەند", "متوفر", "موجود"]; // «جەند» = Kurdish «چەند» (how much)
const PRICE_EXACT = ["كم", "بكم", "شكد", "اشكد", "شقد", "اشقد", "بيش", "شكدسعر", "بيشسعر"];
const QUESTION_PREFIX = ["ترهم", "يرهم", "برهم", "تركب", "يركب", "تتركب", "يصير", "تصير", "يشتغل", "تشتغل",
  "حجم", "قياس", "قطر", "طول", "عرض", "وزن", "حديد", "بلاستك", "بلاستيك", "معدن", "نوعيه", "اصلي", "مقلد", "ضمان",
  "فيديو", "فديو", "موديل", "سياره", "سيارتي", "شحن", "كهرباء", "بطاريه", "شلون يشتغل", "شنو الفرق",
  "لو بس", "لو فقط", "وياها", "وياه", "معها", "معاها", "كامله لو", "كامل لو"];
const QUESTION_EXACT = ["هل", "مال", "نفس", "جيب"];
// A car name means "does it fit my car?" — a person must answer.
const CAR_PREFIX = ["كيا", "تويوتا", "نيسان", "هونداي", "هيونداي", "فورد", "شوفر", "كورلا", "كامري", "سورنتو", "سبورتج", "اسبورتج",
  "النترا", "تاهو", "مرسيدس", "لاندكروز", "باترول", "توسان", "تكسون", "سوناتا", "اوبتما", "بيجو", "رينو", "شفر", "كرايسلر", "دوج", "سيدونه", "تيلورايد", "ليبرتي", "كومندر"];
const FOLLOWUP_PREFIX = ["ما وصل", "ماوصل", "ما وصلن", "لم يصل", "ما اجه", "ما اجاني", "وين الطلب", "وين طلبي", "وين الطلبيه",
  "حجزت", "طلبت", "حجزنا", "اخذت منكم", "اشتريت", "استلمت", "المندوب"];
const BOOKING_PREFIX = ["اريد", "اريدها", "اريده", "رايد", "رايده", "احجز", "حجز", "اطلب", "احتاج", "محتاج", "ارسلي", "ثبت", "ممكن واحد", "ممكن وحده"];
const BOOKING_EXACT = ["ابي", "ابغي", "ريد"];
const DELIVERY_TIME = ["كم يوم", "شكد يوم", "بيش يوم", "متي يوصل", "متي يصل", "شكد يوصل", "شكد ياخذ"];
const DELIVERY_PREFIX = ["توصيل", "يوصل", "توصل", "يصل", "تصل", "واصل", "مكانكم", "مكانك", "عنوانكم", "محلكم", "وين مكان", "كم يوم", "متي يوصل"];
/*
 * Comments that run the product down in public, from ~8,300 real comments:
 * "too expensive", "cheaper elsewhere", "not worth it", "fake / scam".
 * Careful exceptions: «تسوه» alone is praise ("worth it"), «الغالي» is an
 * endearment, and «اصلي لو تقليد؟» is a question.
 */
// Exact words (also with a leading و/ف): never «الغالي» (dear) or names like «الغالبي».
const EXPENSIVE_WORDS = new Set(["غالي", "غاليه", "غاليين", "غالين", "غاليات", "اغلي", "غاليتين"]);
const DISCOURAGE_PREFIX = [
  // too expensive
  "شدعوه", "اشدعوه", "مبالغ", "ماكو هيج سعر", "رخصو", "تستحون", "استحوا", "تستحي من السعر", "استغلال", "مستغل", "تستغلون",
  // cheaper elsewhere
  "ارخص", "تيمو", "temu", "اكسبرس", "اكسبريس", "ناشرته ب", "ناشرينه ب",
  // not worth it
  "ماتسوه", "مايسوه", "ميسوه", "متسوه", "ما تسوه", "ما يسوه", "ما تسوي فلس", "ماتسوي فلس", "ما يسوي فلس", "مايسوي فلس",
  "ما يستاهل", "ما تستاهل", "مايستاهل", "ميستاهل", "ماتستاهل",
  "ما تفيد", "ما يفيد", "ماتفيد", "مايفيد", "ميفيد", "متفيد", "ولاتفيد", "لا تفيد", "ماكو فايده", "مابي فايده", "مابي اي فايده", "ما بيها فايده", "ما بيها اي فايده", "بلا فايده",
  "كلاوات", "مهزله", "لعبه اطفال", "مضيعه",
  // fake, scam, bad quality
  "نصب", "نصاب", "احتيال", "محتال", "كذاب", "غشاش", "غشو", "تقليد", "مقلد", "فاشل", "زبال", "خايس", "مضروب", "سيء", "سيئ",
  "تعرضون شكل", "تسلمون تقليد", "اتحداك اذا سلمت",
  "مو زين", "لاتورط", "لا تورط", "لا تتورط", "لاتشتر", "لا تشتر", "لا تنخدع", "لاتنخدع", "انصح الناس عدم", "انصحكم لا",
  "حرامي", "حراميه", "سراق", "سرقه"];
const DISCOURAGE_EXACT = ["كذب", "جذب", "جذابين", "غش", "الغش", "والغش", "تغش", "يغش", "افشل", "موزين", "تخلف", "جشع", "جشعين",
  // «السنك» market; exact so «سنكل فيز» (single phase) is not caught.
  "سنك", "السنك", "بالسنك", "بلسنك"];
const SECOND_HAND_PLACES = ["باله", "الصناعي", "المحلات", "محلات", "السوك", "سوك", "السوق", "سوق"];
const BARGAIN_HINT = ["اذا", "ممكن", "المفروض", "توصيل", "التوصيل"];
const PRAISE_PREFIX = ["روعه", "رائع", "عاشت", "تسلم", "شكرا", "حلو", "جميل", "خوش", "ممتاز", "احسن", "بالتوفيق", "ابدعتم", "مبدع", "الله يحفظ", "ربي يحفظ"];
const GREETING_WORDS = ["سلام", "السلام", "عليكم", "عليكم السلام", "ورحمه", "الله", "وبركاته", "مرحبا", "هلو", "هلا", "صباح", "مساء", "الخير", "النور", "اخي", "اخويه", "حبيبي"];

const PHONE = /(?<!\d)(?:\+?964|00964|0)?7\d{9}(?!\d)/;

/** True when the comment contains an Iraqi mobile number (after Arabic digits and spaces are folded). */
export function hasPhoneNumber(text: string) {
  return PHONE.test(normalizeArabic(text).replace(/[\s\-–.()]/g, ""));
}

function has(words: string[], prefixes: string[], exact: string[] = []) {
  return exact.some(word => words.includes(word)) || prefixes.some(keyword => {
    const parts = commentWords(keyword);
    return parts.length > 0 && words.some((_, start) =>
      parts.every((part, offset) => start + offset < words.length && wordStartsWith(words[start + offset], part)));
  });
}

/**
 * Most specific first: a phone number is an order; a price question that also
 * asks about a specific car is a question for a person (a template would ignore it).
 */
/** True when the comment runs the product down: too expensive, cheaper elsewhere, not worth it, fake. */
export function isDiscouraging(text: string) {
  const words = commentWords(text);
  const joined = normalizeArabic(text);
  const digit = /\d/.test(joined);
  // Digits may be glued on: «40غاليه».
  if (words.map(word => word.replace(/^\d+/, "")).some(word => EXPENSIVE_WORDS.has(word) || (/^[وف]/.test(word) && EXPENSIVE_WORDS.has(word.slice(1))))) return true;
  // «تقليد/مقلد» inside a question («اصلية لو تقليد؟», «اذا مقلد ما استلم») is a fair question, not an attack.
  const fairQuestion = /اصلي|اذا|هل|لو/.test(joined) && !/تسلمون|تعرضون|ملينا|غش/.test(joined);
  const prefixes = fairQuestion ? DISCOURAGE_PREFIX.filter(word => word !== "تقليد" && word !== "مقلد") : DISCOURAGE_PREFIX;
  if (has(words, prefixes, DISCOURAGE_EXACT)) return true;
  // «سعرك هواي», «هوايه كلش سعر»
  if (/سعر\S*\s+(?:كلش\s+)?هواي|هوايه?\s+(?:كلش\s+)?سعر/.test(joined)) return true;
  // Cheaper at a market or bought cheaply before: «بالباله ب10», «اخذته ب7», «لكيتها ب15», «موجود ب15».
  if (digit && has(words, SECOND_HAND_PLACES)) return true;
  if (/(?:اخذت|اشتريت|شتريت|مشتري|جنت ابيع|لكيت)\S*[^\n]{0,40}?(?:\s|^)ا?ب\s?\d/.test(joined)) return true;
  if (/لكيت\S*/.test(joined) && digit) return true;
  if (/موجود\S*\s*ا?ب\s?\d|ا?ب\s?(?:\d+|عشره|خمسه|الفين)\S*\s+موجود/.test(joined)) return true;
  return false;
}

export function classifyComment(text: string): CommentIntent {
  if (hasPhoneNumber(text)) return "order";
  if (isDiscouraging(text)) return "complaint";
  const words = commentWords(text);
  const joined = normalizeArabic(text);
  // «بيشسعرها» and similar run-together spellings.
  const price = has(words, PRICE_PREFIX, PRICE_EXACT) || /سعر/.test(joined);
  if (has(words, FOLLOWUP_PREFIX)) return "followup";
  if (has(words, QUESTION_PREFIX, QUESTION_EXACT) || has(words, CAR_PREFIX)) return "question";
  // A price the customer proposes: «اذا ب15 مع التوصيل», «ممكن ب 15 الف».
  if (/(?:^|[^\d])\d{1,6}(?!\d)/.test(joined) && has(words, BARGAIN_HINT)) return "bargain";
  if (has(words, DELIVERY_TIME)) return "delivery";
  if (price) return "price";
  if (has(words, BOOKING_PREFIX, BOOKING_EXACT)) return "booking";
  if (has(words, DELIVERY_PREFIX)) return "delivery";
  if (has(words, PRAISE_PREFIX) || (/\p{Extended_Pictographic}/u.test(text) && !words.length)) return "praise";
  if (words.length && words.every(word => GREETING_WORDS.some(greeting => commentWords(greeting).includes(word)))) return "greeting";
  return "other";
}
