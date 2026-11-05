import { COMMITTED_STATUSES, MANUAL_STATUSES, normalizeImportStatus } from "./import-status";

it("reads the merged old stages as their new stage", () => {
  expect(normalizeImportStatus("idea")).toBe("studying");
  expect(normalizeImportStatus("approved")).toBe("ordered");
  expect(normalizeImportStatus("shipping")).toBe("ordered");
  expect(normalizeImportStatus("arrived")).toBe("arrived");
  expect(normalizeImportStatus("converted")).toBe("converted");
  expect(normalizeImportStatus("???")).toBe("studying");
});

it("offers only the main stages", () => {
  expect(MANUAL_STATUSES).toEqual(["studying", "ordered", "arrived", "rejected"]);
  expect(COMMITTED_STATUSES).toEqual(["ordered", "arrived"]);
});
