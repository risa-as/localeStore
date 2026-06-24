/**
 * Batch cost engine (FIFO — first purchased, first out).
 *
 * Pure, dependency-free module so it can be unit-tested and reused by both the
 * profit page (COGS) and the batches page (remaining qty per batch).
 *
 * The goods tracked here do not expire, so batches are consumed in the order
 * they were added (oldest createdAt first). Sales are consumed in chronological
 * order so the batch cursor advances correctly across time. If sales exceed the
 * available batch quantity, the overflow units fall back to `fallbackCost` (the
 * product's base costPrice) and are reported so the UI can flag them.
 */

export type FefoBatch = {
  id: string;
  quantity: number;
  costPrice: number;
  createdAt: Date;
};

export type FefoSale = {
  /** Unique key per sale, e.g. `${orderId}:${productId}`. */
  key: string;
  /** Order creation date — used to order consumption chronologically. */
  date: Date;
  qty: number;
};

export type FefoResult = {
  /** Total cost assigned to each sale key (blended across batches + fallback). */
  saleCost: Map<string, number>;
  /** Units per sale that fell back to fallbackCost (no batch stock left). */
  saleFallbackQty: Map<string, number>;
  /** Remaining qty per batch id after all consumption. */
  batchRemaining: Map<string, number>;
  /** Consumed qty per batch id. */
  batchConsumed: Map<string, number>;
  /** Total units that could not be matched to any batch. */
  totalFallbackQty: number;
};

/** Sort batches FIFO: oldest added (createdAt) first. */
export function sortBatchesFefo<T extends FefoBatch>(batches: T[]): T[] {
  return [...batches].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/**
 * Walk sales chronologically, consuming batches in the order they were added.
 * Returns per-sale cost and per-batch remaining quantities.
 */
export function computeFefo(
  batches: FefoBatch[],
  sales: FefoSale[],
  fallbackCost: number,
): FefoResult {
  const sortedBatches = sortBatchesFefo(batches);
  const batchRemaining = new Map<string, number>();
  const batchConsumed = new Map<string, number>();
  for (const b of sortedBatches) {
    batchRemaining.set(b.id, b.quantity);
    batchConsumed.set(b.id, 0);
  }

  const sortedSales = [...sales].sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    return d !== 0 ? d : a.key.localeCompare(b.key);
  });

  const saleCost = new Map<string, number>();
  const saleFallbackQty = new Map<string, number>();
  let totalFallbackQty = 0;

  let batchIdx = 0;
  for (const sale of sortedSales) {
    let need = sale.qty;
    let cost = 0;
    let fallbackQty = 0;

    while (need > 0 && batchIdx < sortedBatches.length) {
      const b = sortedBatches[batchIdx];
      const rem = batchRemaining.get(b.id)!;
      if (rem <= 0) {
        batchIdx++;
        continue;
      }
      const take = Math.min(rem, need);
      cost += take * b.costPrice;
      batchRemaining.set(b.id, rem - take);
      batchConsumed.set(b.id, (batchConsumed.get(b.id) ?? 0) + take);
      need -= take;
      if (rem - take === 0) batchIdx++;
    }

    if (need > 0) {
      cost += need * fallbackCost;
      fallbackQty = need;
      totalFallbackQty += need;
    }

    saleCost.set(sale.key, (saleCost.get(sale.key) ?? 0) + cost);
    if (fallbackQty > 0) {
      saleFallbackQty.set(
        sale.key,
        (saleFallbackQty.get(sale.key) ?? 0) + fallbackQty,
      );
    }
  }

  return {
    saleCost,
    saleFallbackQty,
    batchRemaining,
    batchConsumed,
    totalFallbackQty,
  };
}
