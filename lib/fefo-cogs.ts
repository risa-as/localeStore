/**
 * Server-side FEFO orchestration: pulls batches + completed sales from the DB
 * and runs the pure FEFO engine (`lib/fefo.ts`) per product.
 *
 * Shared by the profit page (COGS) and the batches page (remaining per batch).
 * This is a plain module (not a server action) so it can be imported by any
 * server component or action without creating an action endpoint.
 *
 * Key design decisions (see plan):
 *  - Consumption counts only completed orders: `completed` + `completedAccountant`.
 *  - Per-product FEFO start = the createdAt of the product's earliest batch.
 *    Sales whose order.createdAt is before that keep their frozen snapshot cost
 *    (historical numbers never change). Only sales on/after it use FEFO.
 *  - Overflow beyond batch quantity falls back to the product's base costPrice.
 */

import { prisma } from "@/db/prisma";
import { computeFefo, type FefoBatch } from "./fefo";

export const COMPLETED_STATUSES = ["completed", "completedAccountant"];

export type BatchWithMeta = FefoBatch & {
  batchNumber: string | null;
  notes: string | null;
  productName: string;
};

export type ProductFefoContext = {
  productId: string;
  productName: string;
  fallbackCost: number;
  /** createdAt of the product's earliest batch — the FEFO start boundary. */
  fefoStart: Date;
  batches: BatchWithMeta[];
  saleCost: Map<string, number>;
  saleFallbackQty: Map<string, number>;
  batchRemaining: Map<string, number>;
  batchConsumed: Map<string, number>;
};

/** Stable key per sale (one order item). */
export function saleKey(orderId: string, productId: string): string {
  return `${orderId}:${productId}`;
}

/**
 * Build FEFO contexts for the given products (or all products that have batches
 * when `productIds` is omitted). Returns a map keyed by productId.
 */
export async function buildFefoContexts(
  productIds?: string[],
): Promise<Map<string, ProductFefoContext>> {
  // 1) Fetch batches (optionally scoped to specific products).
  const batches = await prisma.productBatch.findMany({
    where: productIds && productIds.length > 0 ? { productId: { in: productIds } } : {},
    include: { product: { select: { name: true, costPrice: true } } },
  });

  if (batches.length === 0) return new Map();

  // Group batches per product + derive fefoStart + fallbackCost.
  const byProduct = new Map<
    string,
    {
      productName: string;
      fallbackCost: number;
      fefoStart: Date;
      batches: BatchWithMeta[];
    }
  >();

  for (const b of batches) {
    const existing = byProduct.get(b.productId);
    const mapped: BatchWithMeta = {
      id: b.id,
      quantity: b.quantity,
      costPrice: Number(b.costPrice),
      createdAt: new Date(b.createdAt),
      batchNumber: b.batchNumber,
      notes: b.notes,
      productName: b.product.name,
    };
    if (existing) {
      existing.batches.push(mapped);
      if (mapped.createdAt < existing.fefoStart) existing.fefoStart = mapped.createdAt;
    } else {
      byProduct.set(b.productId, {
        productName: b.product.name,
        fallbackCost: Number(b.product.costPrice),
        fefoStart: mapped.createdAt,
        batches: [mapped],
      });
    }
  }

  const batchedProductIds = Array.from(byProduct.keys());

  // 2) Fetch all completed sales for these products (whole FEFO era).
  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: { in: batchedProductIds },
      order: { status: { in: COMPLETED_STATUSES } },
    },
    select: {
      orderId: true,
      productId: true,
      qty: true,
      order: { select: { createdAt: true } },
    },
  });

  // Group FEFO-era sales per product.
  const salesByProduct = new Map<
    string,
    { key: string; date: Date; qty: number }[]
  >();
  for (const item of orderItems) {
    const ctx = byProduct.get(item.productId);
    if (!ctx) continue;
    const createdAt = new Date(item.order.createdAt);
    // Only sales on/after the product's FEFO start consume batches.
    if (createdAt < ctx.fefoStart) continue;
    const list = salesByProduct.get(item.productId) ?? [];
    list.push({
      key: saleKey(item.orderId, item.productId),
      date: createdAt,
      qty: item.qty,
    });
    salesByProduct.set(item.productId, list);
  }

  // 3) Run FEFO per product.
  const contexts = new Map<string, ProductFefoContext>();
  for (const [productId, ctx] of byProduct) {
    const sales = salesByProduct.get(productId) ?? [];
    const result = computeFefo(ctx.batches, sales, ctx.fallbackCost);
    contexts.set(productId, {
      productId,
      productName: ctx.productName,
      fallbackCost: ctx.fallbackCost,
      fefoStart: ctx.fefoStart,
      batches: ctx.batches,
      saleCost: result.saleCost,
      saleFallbackQty: result.saleFallbackQty,
      batchRemaining: result.batchRemaining,
      batchConsumed: result.batchConsumed,
    });
  }

  return contexts;
}
