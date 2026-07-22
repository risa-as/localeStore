import { computeFefo, sortBatchesFefo, type FefoBatch } from "./fefo";
import {
  STOCK_CONSUMED_STATUSES,
  REVENUE_STATUSES,
} from "./constants/order-statuses";

const d = (iso: string) => new Date(iso);

const batch = (
  id: string,
  quantity: number,
  costPrice: number,
  createdAt: string,
): FefoBatch => ({ id, quantity, costPrice, createdAt: d(createdAt) });

describe("sortBatchesFefo", () => {
  it("orders batches oldest-purchased first regardless of input order", () => {
    const sorted = sortBatchesFefo([
      batch("new", 5, 2000, "2026-03-01"),
      batch("old", 5, 1000, "2026-01-01"),
      batch("mid", 5, 1500, "2026-02-01"),
    ]);
    expect(sorted.map((b) => b.id)).toEqual(["old", "mid", "new"]);
  });
});

describe("computeFefo", () => {
  it("consumes the oldest batch first and prices the sale at its cost", () => {
    const result = computeFefo(
      [batch("A", 10, 1000, "2026-01-01"), batch("B", 10, 2000, "2026-02-01")],
      [{ key: "o1:p", date: d("2026-03-01"), qty: 4 }],
      999,
    );

    expect(result.saleCost.get("o1:p")).toBe(4000); // 4 × 1000, all from batch A
    expect(result.batchRemaining.get("A")).toBe(6);
    expect(result.batchRemaining.get("B")).toBe(10);
    expect(result.batchConsumed.get("A")).toBe(4);
    expect(result.totalFallbackQty).toBe(0);
  });

  it("blends cost across two batches when a sale spans the boundary", () => {
    const result = computeFefo(
      [batch("A", 10, 1000, "2026-01-01"), batch("B", 10, 2000, "2026-02-01")],
      [{ key: "o1:p", date: d("2026-03-01"), qty: 12 }],
      999,
    );

    // 10 units @1000 from A + 2 units @2000 from B
    expect(result.saleCost.get("o1:p")).toBe(10000 + 4000);
    expect(result.batchRemaining.get("A")).toBe(0);
    expect(result.batchRemaining.get("B")).toBe(8);
  });

  it("falls back to base cost for units beyond all batch stock", () => {
    const result = computeFefo(
      [batch("A", 5, 1000, "2026-01-01")],
      [{ key: "o1:p", date: d("2026-03-01"), qty: 8 }],
      700,
    );

    expect(result.saleCost.get("o1:p")).toBe(5000 + 3 * 700);
    expect(result.saleFallbackQty.get("o1:p")).toBe(3);
    expect(result.totalFallbackQty).toBe(3);
    expect(result.batchRemaining.get("A")).toBe(0);
  });

  it("walks sales chronologically, not in array order", () => {
    const later = { key: "later:p", date: d("2026-03-10"), qty: 5 };
    const earlier = { key: "earlier:p", date: d("2026-03-01"), qty: 10 };

    const result = computeFefo(
      [batch("A", 10, 1000, "2026-01-01"), batch("B", 10, 2000, "2026-02-01")],
      [later, earlier], // deliberately out of order
      999,
    );

    // The earlier sale drains batch A even though it is listed second.
    expect(result.saleCost.get("earlier:p")).toBe(10000);
    expect(result.saleCost.get("later:p")).toBe(10000); // 5 × 2000 from batch B
  });

  /**
   * Regression guard for the pending-orders change: an order that has shipped but
   * is not yet paid still consumes inventory. That advances the FEFO cursor, so a
   * later completed sale correctly draws from the newer, costlier batch.
   */
  it("lets an earlier shipped-but-unpaid sale push a later sale onto the next batch", () => {
    const batches = [
      batch("A", 10, 1000, "2026-01-01"),
      batch("B", 10, 2000, "2026-02-01"),
    ];
    const completedSale = { key: "completed:p", date: d("2026-03-10"), qty: 5 };

    const withoutPending = computeFefo(batches, [completedSale], 999);
    const withPending = computeFefo(
      batches,
      [{ key: "pending:p", date: d("2026-03-01"), qty: 10 }, completedSale],
      999,
    );

    expect(withoutPending.saleCost.get("completed:p")).toBe(5000); // batch A @1000
    expect(withPending.saleCost.get("completed:p")).toBe(10000); // batch B @2000
    expect(withPending.batchRemaining.get("A")).toBe(0);
    expect(withPending.batchRemaining.get("B")).toBe(5);
  });

  it("reports full remaining and no cost when there are no sales", () => {
    const result = computeFefo([batch("A", 7, 1000, "2026-01-01")], [], 999);
    expect(result.batchRemaining.get("A")).toBe(7);
    expect(result.batchConsumed.get("A")).toBe(0);
    expect(result.saleCost.size).toBe(0);
  });
});

describe("order status groupings", () => {
  it("treats pending as consuming stock but not as revenue", () => {
    expect(STOCK_CONSUMED_STATUSES).toContain("pending");
    expect(REVENUE_STATUSES).not.toContain("pending");
  });

  it("counts every revenue status as having consumed stock", () => {
    for (const status of REVENUE_STATUSES) {
      expect(STOCK_CONSUMED_STATUSES).toContain(status);
    }
  });

  it("never counts returned orders as consuming stock, so returns restock", () => {
    expect(STOCK_CONSUMED_STATUSES).not.toContain("returned");
    expect(STOCK_CONSUMED_STATUSES).not.toContain("returnReceived");
  });
});
