import { inboxDate } from "./inbox-date";

const plain = (text: string) => text.replace(/[⁦⁩]/g, "");

it("formats inbox dates as year-month-day with a 24-hour time", () => {
  const date = new Date(2026, 10, 4, 21, 3);
  expect(plain(inboxDate(date))).toBe("2026-11-04 21:03");
  expect(plain(inboxDate(date.toISOString(), false))).toBe("2026-11-04");
  expect(inboxDate("not a date")).toBe("");
  expect(inboxDate("")).toBe("");
});
