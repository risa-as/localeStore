/**
 * Order-status groupings shared by the inventory and profit layers.
 *
 * These two lists are deliberately DIFFERENT. Keeping them separate is the whole
 * point of this module — collapsing them back into one list reintroduces the bug
 * where /admin/products and /admin/batches disagreed on what "sold" means.
 */

/**
 * Orders whose units have physically LEFT the warehouse.
 *
 * `pending` is included: once an order is handed to the delivery company the goods
 * are gone from our shelves, even though the money has not arrived yet. This is the
 * definition of "sold" for stock deduction and for FEFO batch consumption.
 *
 * Failed delivery, rescheduling and return-in-transit still occupy stock.
 * Only returnReceived releases goods; persisted allocations retain their cost
 * and record the reversal against the original batch.
 */
export const STOCK_CONSUMED_STATUSES = [
  "completed",
  "completedAccountant",
  "pending",
  "failed",
  "rescheduled",
  "returned",
];

/**
 * Orders that count as REALIZED REVENUE.
 *
 * `pending` is excluded here on purpose: the goods left the warehouse but the cash
 * has not been collected, so it is not revenue yet. Used by the profit page.
 */
export const REVENUE_STATUSES = ["completed", "completedAccountant"];
