import {
  appendNote,
  baghdadStamp,
  decideItemMerge,
  decideShippingUpdate,
  differentAddressNote,
  duplicateNote,
} from "./merge-policy";

describe("decideItemMerge", () => {
  it("adds a product the existing order does not have", () => {
    expect(decideItemMerge(null, 1)).toEqual({ kind: "append" });
    expect(decideItemMerge(undefined, 3)).toEqual({ kind: "append" });
  });

  it("never sums the quantity of a product already in the order", () => {
    // هذا هو جوهر الإصلاح: كان qty يصبح 2 فيصل الزبون قطعتين لا يريدهما
    expect(decideItemMerge(1, 1)).toEqual({
      kind: "duplicate",
      existingQty: 1,
      requestedQty: 1,
    });
  });

  it("treats a larger repeat request as a duplicate too — الموظّف يؤكّد هاتفياً", () => {
    expect(decideItemMerge(2, 5)).toEqual({
      kind: "duplicate",
      existingQty: 2,
      requestedQty: 5,
    });
  });
});

describe("decideShippingUpdate", () => {
  const base = { fullName: "علي حسن", governorate: "بغداد", address: "الكرادة" };

  it("allows updating when the destination is the same", () => {
    expect(decideShippingUpdate(base, { ...base, fullName: "علي حسن محمد" })).toEqual({
      kind: "update",
    });
  });

  it("ignores whitespace and case differences in the destination", () => {
    expect(
      decideShippingUpdate(base, { ...base, address: "  الكرادة  " }),
    ).toEqual({ kind: "update" });
  });

  it("keeps the original destination when the governorate differs", () => {
    const incoming = { ...base, governorate: "البصرة" };
    expect(decideShippingUpdate(base, incoming)).toEqual({ kind: "keep", incoming });
  });

  it("keeps the original destination when the address differs", () => {
    const incoming = { ...base, address: "المنصور" };
    expect(decideShippingUpdate(base, incoming)).toEqual({ kind: "keep", incoming });
  });
});

describe("baghdadStamp", () => {
  it("shifts UTC to Baghdad time (UTC+3)", () => {
    expect(baghdadStamp(new Date("2026-07-09T11:32:00Z"))).toBe("09/07 14:32");
  });

  it("rolls over to the next day past 21:00 UTC", () => {
    expect(baghdadStamp(new Date("2026-07-09T22:10:00Z"))).toBe("10/07 01:10");
  });
});

describe("notes", () => {
  const now = new Date("2026-07-09T11:32:00Z");

  it("names the product and the requested quantity in the duplicate note", () => {
    const note = duplicateNote("ساعة الحائط الرقمية", 1, now);
    expect(note).toContain("ساعة الحائط الرقمية");
    expect(note).toContain("09/07 14:32");
    expect(note).toContain("لم تُزَد الكمية");
  });

  it("names the new destination in the address note", () => {
    const note = differentAddressNote(
      { fullName: "علي", governorate: "البصرة", address: "العشار" },
      now,
    );
    expect(note).toContain("البصرة");
    expect(note).toContain("العشار");
  });

  it("appends without erasing existing staff notes", () => {
    expect(appendNote("ملاحظة الموظّف", "جديدة")).toBe("ملاحظة الموظّف\nجديدة");
  });

  it("keeps the note when there is nothing before it", () => {
    expect(appendNote(null, "جديدة")).toBe("جديدة");
    expect(appendNote("   ", "جديدة")).toBe("جديدة");
  });

  it("does not repeat an identical note", () => {
    const note = duplicateNote("منتج", 1, now);
    expect(appendNote(note, note)).toBe(note);
  });
});
