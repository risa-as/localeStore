import { extractInboxQuantity } from "./inbox-quantity";

it.each(["العدد 2", "العدد ٢", "العدد ۲", "الكمية: 2", "الكميه 2", "العدد 2 قطعتين", "عدد القطع - 2", "2 قطع", "قطعتين", "قطعتان", "قطعتين اريد", "اريد قطعتين", "07801234567قطعتين اريد"])("extracts an explicit pair: %s", text => {
  expect(extractInboxQuantity([text])).toBe(2);
});
it("uses the most recent explicit quantity rather than adding repeated mentions", () => {
  expect(extractInboxQuantity(["قطعه وحده", "العدد 2 قطعتين", "العدد 2"])).toBe(2);
  expect(extractInboxQuantity(["اريد قطعتين", "الكمية 1"])).toBe(1);
});
it.each(["السعر 20 الف", "سعر القطعتين 25 الف", "قطعتين شكد؟", "قطعتين بكم", "07701234567", "٢", "قبل يومين", "شارع 20 محلة 2", "العنوان قطعة 2", "عرض 2 قطع", "https://example.com/2"])("does not treat price/phone/date/address numbers as a quantity: %s", text => {
  expect(extractInboxQuantity([text])).toBe(1);
});
it("does not replace a known quantity with later price questions or address numbers", () => {
  expect(extractInboxQuantity(["العدد 2", "قطعتين شكد سعرها؟", "شارع 5 بيت 12"])).toBe(2);
});
it("preserves invalid zero for form validation instead of silently booking one", () => {
  expect(extractInboxQuantity(["العدد 0"])).toBe(0);
});
