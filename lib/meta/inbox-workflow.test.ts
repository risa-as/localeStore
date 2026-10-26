import { groupInboxComments, selectedOrderValue, inboxPhoneCandidates, inboxOrderLookupHref } from "./inbox-workflow";
import type { InboxItem } from "./inbox";
jest.mock("../utils", () => ({
  formatNumberWithDecimal: (value: number) => value.toFixed(2),
  convertArabicToEnglishNumbers: (value: string) => value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)),
}));
const comment = (id: string, authorId?: string, title = "أحمد"): InboxItem => ({ id, handle: id, title, authorId, text: id, time: "2026-10-24", outgoing: false });

it.each([undefined, null, "", "undefined", "null"])("uses the searched phone when an order response has a missing/invalid phone: %s", phoneNumber => {
  const href = inboxOrderLookupHref("ar", { id: "order1", status: "home", phoneNumber }, "07701234567");
  expect(href).toBe("/ar/admin/orders?status=home&query=07701234567");
});
it("preserves the saved phone format for the order list and safely encodes its plus sign", () => {
  expect(inboxOrderLookupHref("ar", { id: "o1", status: "pending", phoneNumber: "+9647701234567" }, "07701234567"))
    .toBe("/ar/admin/orders?status=pending&query=%2B9647701234567");
  expect(inboxOrderLookupHref("ar", { id: "o1", status: "completed", phoneNumber: "7701234567" }))
    .toBe("/ar/admin/orders?status=completed&query=7701234567");
});
it("does not build a broken search if neither phone is available", () => {
  expect(inboxOrderLookupHref("ar", { id: "o1", status: "pending" })).toBe("/ar/order/o1");
});

it("finds every distinct complete customer phone, normalizes formats and excludes Page/system text", () => {
  const messages = [
    { ...comment("a"), text: "رقمي ٠٧٧٠١٢٣٤٥٦٧ أو +964 780-123-4567" },
    { ...comment("b"), text: "00964 (770) 123 4567" },
    { ...comment("c"), text: "اتصل على 07909999999", outgoing: true },
    { ...comment("d"), text: "07509999999", system: "comment-origin" as const },
    { ...comment("e"), text: "123 و07101234567" },
  ];
  expect(inboxPhoneCandidates(messages)).toEqual(["07701234567", "07801234567"]);
});

it.each([
  ["٠٧٧٠ ١٢٣ ٤٥٦٧", "07701234567"],
  ["+964 780-123-4567", "07801234567"],
  ["۰۰۹۶۴۷۹۰۱۲۳۴۵۶۷", "07901234567"],
  ["\u200f(0750) 123-4567\u200e", "07501234567"],
])("normalizes the explicitly selected Iraqi phone using checkout validation: %s", (input, expected) => {
  expect(selectedOrderValue("phoneNumber", input)).toBe(expected);
});
it.each(["123", "07701234567 07801234567", "اتصل على 07701234567", "07101234567"])("rejects ambiguous or invalid phone selection: %s", input => {
  expect(() => selectedOrderValue("phoneNumber", input)).toThrow("واحداً كاملاً");
});
it("preserves an explicitly selected address and enforces form length limits", () => {
  expect(selectedOrderValue("address", "  بغداد — حي الجامعة\nقرب الجامع  ")).toBe("بغداد — حي الجامعة\nقرب الجامع");
  expect(() => selectedOrderValue("address", "حي")).toThrow();
  expect(() => selectedOrderValue("address", "أ".repeat(1001))).toThrow();
});
it("groups only the same customer, preserving every distinct comment and first appearance order", () => {
  const result = groupInboxComments([comment("a", "customer1"), comment("b", "customer2"), comment("c", "customer1"), comment("a", "customer1")]);
  expect(result.map(group => group.items.map(item => item.id))).toEqual([["a", "c"], ["b"]]);
  expect(result[0].items).toHaveLength(2);
});
it("never merges matching display names or anonymous authors, or groups Page replies into customer comments", () => {
  const items = [comment("a", "one"), comment("b", "two"), comment("c"), comment("d"), { ...comment("e", "one"), outgoing: true }];
  expect(groupInboxComments(items)).toHaveLength(5);
});
it("uses Instagram username identity when Meta does not provide author id", () => {
  expect(groupInboxComments([{ ...comment("a"), authorUsername: "User.Name" }, { ...comment("b"), authorUsername: "user.name" }])).toHaveLength(1);
});
