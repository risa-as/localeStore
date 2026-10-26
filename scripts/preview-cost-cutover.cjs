/* Read-only baseline of the pre-fix report. No database mutations. */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { costCutoverPlan } = require('./cost-cutover-plan.cjs');
const assert = require('node:assert/strict');
const original = execFileSync('git', ['show', 'HEAD:lib/fefo.ts'], { encoding: 'utf8' });
const sandbox = { exports: {}, module: { exports: {} } };
vm.runInNewContext(transformSync(original, { loader: 'ts', format: 'cjs' }).code, sandbox);
const computeLegacy = sandbox.module.exports.computeFefo;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const batches = (await client.query('SELECT id, "productId", quantity, "costPrice", "createdAt" FROM "ProductBatch" ORDER BY "createdAt", id')).rows;
    const products = (await client.query('SELECT id, "costPrice" FROM "Product" ORDER BY id')).rows;
    const items = (await client.query('SELECT i."orderId", i."productId", i.qty, i."costPrice", i.price, o.status, o."createdAt" FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" ORDER BY o."createdAt", i."orderId", i."productId"')).rows;
    const cost = new Map(items.map(item => [`${item.orderId}:${item.productId}`, Number(item.costPrice) * item.qty]));
    for (const product of products) {
      const productBatches = batches.filter(batch => batch.productId === product.id).map(batch => ({ ...batch, costPrice: Number(batch.costPrice) }));
      if (!productBatches.length) continue;
      const sales = items.filter(item => item.productId === product.id && ['completed', 'completedAccountant', 'pending'].includes(item.status) && item.createdAt >= productBatches[0].createdAt).map(item => ({ key: `${item.orderId}:${item.productId}`, qty: item.qty, date: item.createdAt }));
      const result = computeLegacy(productBatches, sales, Number(product.costPrice));
      for (const [key, amount] of result.saleCost) cost.set(key, amount);
    }
    await client.query('ROLLBACK');
    const baseline = items.map(item => ({ orderId: item.orderId, productId: item.productId, qty: item.qty, status: item.status, costTotal: Math.round(cost.get(`${item.orderId}:${item.productId}`) * 100) / 100 }));
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ batches, products, items })).digest('hex');
    const plan = costCutoverPlan({ batches, products, items });
    assert.deepEqual(plan.baseline, baseline, 'Cutover must preserve the old report exactly');
    const summary = { mode: 'read-only-preview', fingerprint, items: baseline.length, completedCost: baseline.filter(i => ['completed', 'completedAccountant'].includes(i.status)).reduce((sum, i) => sum + i.costTotal, 0), note: 'Old reported cost baseline, not proof of physical batch history. Migration and backfill are not applied.' };
    fs.mkdirSync('.audit-private', { recursive: true });
    fs.writeFileSync('.audit-private/cost-baseline.json', JSON.stringify({ summary, ...plan }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.name + ': ' + error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
