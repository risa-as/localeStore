import { classifyComment, hasPhoneNumber, type CommentIntent } from "./comment-intent";

// Real comment shapes from the store's posts (names and numbers changed).
const cases: [string, CommentIntent][] = [
  ["السعر", "price"], ["سعر", "price"], ["كم السعر", "price"], ["شكد السعر؟", "price"], ["بيش", "price"],
  ["ممكن السعر مع التوصيل", "price"], ["شكدسعرة", "price"], ["بيشسعرها مع التوصيل رجاءا", "price"], ["اشگد سعرها.", "price"],
  ["لسعر", "price"], ["السلام عليكم ممكن السعر والتوصيل بابل", "price"], ["متوفر هذا المنتج", "price"],
  ["رايد قطعه ديالى المقداديه 07701234567", "order"], ["كربلاء ٠٧٧٠١٢٣٤٥٦٧", "order"], ["اريد سيت بغداد 0770 123 4567", "order"],
  ["ترهم على سياره فورد تورس موديل 17 ؟؟؟", "question"], ["شكد سعرها عندي كيا سبورتج 19", "question"],
  ["هل المنشار مع القاعده ام القاعده لوحدها", "question"], ["كامله الكوسره لو بس القاعده", "question"], ["شكد حجم اللقم", "question"],
  ["اريد وحده", "booking"], ["ممكن حجز", "booking"], ["رايد قطعه للبصره", "booking"], ["ثبت الحجز", "booking"],
  ["وين مكانكم", "delivery"], ["كم يوم يصل طلب", "delivery"], ["اكو توصيل واسط", "delivery"],
  ["اذا ب15 مع التوصيل ثبت حجز", "bargain"], ["ممكن ب 15 الف مع التوصيل ؟", "bargain"],
  ["حجزت 2 ولهسا ما وصلن", "followup"], ["صار ٣ ايام وين الطلبيه", "followup"], ["لم يصل المندوب", "followup"],
  ["غالي جدا", "complaint"], ["السبب اسعاركم غاليه ونشتري من غيركم", "complaint"],
  ["روعه جدا وجميل", "praise"], ["👍👍", "praise"], ["عاشت الايادي", "praise"],
  ["السلام عليكم", "greeting"], ["مساء الخير", "greeting"],
  ["محمد جعفر", "other"], ["جندب عبد الوهاب", "other"], ["تم", "other"], ["السلام عليكم ورحمه الله", "greeting"],
];

it.each(cases)("classifies «%s» as %s", (text, intent) => {
  expect(classifyComment(text)).toBe(intent);
});

it("recognizes Iraqi mobile numbers in any digits and spacing", () => {
  expect(hasPhoneNumber("رقمي 07701234567")).toBe(true);
  expect(hasPhoneNumber("٠٧٨٠ ١٢٣ ٤٥٦٧")).toBe(true);
  expect(hasPhoneNumber("+964 770 123 4567")).toBe(true);
  expect(hasPhoneNumber("السعر 15000 والتوصيل 5000")).toBe(false);
  expect(hasPhoneNumber("موديل 2012")).toBe(false);
});
