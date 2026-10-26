const crypto = require('node:crypto');
const oldStockStatuses = ['completed', 'completedAccountant', 'pending'];
const physicalStatuses = [...oldStockStatuses, 'failed', 'rescheduled', 'returned'];

/** Reconstructs the old report as an explicitly labelled baseline, not audited physical history. */
function costCutoverPlan({ batches, products, items }) {
  const allocations = [];
  const costs = new Map(items.map(i => [`${i.orderId}:${i.productId}`, Number(i.costPrice) * i.qty]));
  for (const product of products) {
    const receipts = batches.filter(b => b.productId === product.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!receipts.length) continue;
    const sales = items.filter(i => i.productId === product.id && oldStockStatuses.includes(i.status) && new Date(i.createdAt) >= new Date(receipts[0].createdAt)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || `${a.orderId}:${a.productId}`.localeCompare(`${b.orderId}:${b.productId}`));
    const remaining = new Map(receipts.map(b => [b.id, b.quantity]));
    let cursor = 0;
    for (const sale of sales) {
      let need = sale.qty;
      let cost = 0;
      const add = (quantity, unitCost, batchId) => {
        allocations.push({ orderId: sale.orderId, productId: product.id, batchId, quantity, unitCost, source: 'legacy-report' });
        cost += quantity * unitCost;
        need -= quantity;
      };
      while (need > 0 && cursor < receipts.length) {
        const batch = receipts[cursor];
        const take = Math.min(need, remaining.get(batch.id));
        if (take > 0) { add(take, Number(batch.costPrice), batch.id); remaining.set(batch.id, remaining.get(batch.id) - take); }
        if (!remaining.get(batch.id)) cursor++;
      }
      if (need > 0) add(need, Number(product.costPrice), null);
      costs.set(`${sale.orderId}:${product.id}`, cost);
    }
  }
  // Old untracked/outstanding shipments still occupy stock, but their batch is unknown.
  for (const item of items.filter(i => physicalStatuses.includes(i.status))) {
    if (!allocations.some(a => a.orderId === item.orderId && a.productId === item.productId)) allocations.push({ orderId: item.orderId, productId: item.productId, batchId: null, quantity: item.qty, unitCost: Number(item.costPrice), source: 'legacy-unallocated' });
  }
  const baseline = items.map(i => ({ orderId: i.orderId, productId: i.productId, qty: i.qty, status: i.status, costTotal: Math.round(costs.get(`${i.orderId}:${i.productId}`) * 100) / 100 }));
  return { fingerprint: crypto.createHash('sha256').update(JSON.stringify({ batches, products, items })).digest('hex'), baseline, allocations, activeOrderIds: [...new Set(items.filter(i => physicalStatuses.includes(i.status)).map(i => i.orderId))] };
}
module.exports = { costCutoverPlan };
