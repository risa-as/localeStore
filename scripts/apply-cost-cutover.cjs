/* Explicit cutover command. Run only after the additive migration and a fresh reviewed preview. */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { costCutoverPlan } = require('./cost-cutover-plan.cjs');
const { randomUUID } = require('node:crypto');

async function main() {
  const fingerprint = process.argv.find(arg => arg.startsWith('--fingerprint='))?.slice(14);
  if (!process.argv.includes('--apply') || !/^[a-f0-9]{64}$/.test(fingerprint || '')) throw new Error('Requires --apply --fingerprint=<fresh preview fingerprint>. Preview with node scripts/preview-cost-cutover.cjs');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE "Order", "OrderItem", "Product", "ProductBatch", "InventoryAllocation" IN SHARE ROW EXCLUSIVE MODE');
    if (Number((await client.query('SELECT count(*) AS n FROM "InventoryAllocation"')).rows[0].n) || Number((await client.query('SELECT count(*) AS n FROM "OrderItem" WHERE "costTotal" IS NOT NULL')).rows[0].n)) throw new Error('Costs already initialized; do not overwrite them.');
    const batches = (await client.query('SELECT id, "productId", quantity, "costPrice", "createdAt" FROM "ProductBatch" ORDER BY "createdAt", id')).rows;
    const products = (await client.query('SELECT id, "costPrice" FROM "Product" ORDER BY id')).rows;
    const items = (await client.query('SELECT i."orderId", i."productId", i.qty, i."costPrice", i.price, o.status, o."createdAt" FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" ORDER BY o."createdAt", i."orderId", i."productId"')).rows;
    const plan = costCutoverPlan({ batches, products, items });
    if (plan.fingerprint !== fingerprint) throw new Error('Store data changed after preview. Generate a fresh preview before cutover.');
    await client.query('UPDATE "OrderItem" i SET "costTotal" = p."costTotal", "costSource" = \'legacy-report\' FROM jsonb_to_recordset($1::jsonb) AS p("orderId" uuid,"productId" uuid,"costTotal" numeric) WHERE i."orderId"=p."orderId" AND i."productId"=p."productId"', [JSON.stringify(plan.baseline)]);
    await client.query('INSERT INTO "InventoryAllocation" (id,"orderId","productId","batchId",quantity,"unitCost",source) SELECT id,"orderId","productId","batchId",quantity,"unitCost",source FROM jsonb_to_recordset($1::jsonb) AS p(id text,"orderId" uuid,"productId" uuid,"batchId" uuid,quantity integer,"unitCost" numeric,source text)', [JSON.stringify(plan.allocations.map(a => ({ ...a, id: randomUUID() })))]);
    // These timestamps mark the baseline observation, not an invented historical delivery date.
    await client.query('UPDATE "Order" SET "inventoryDispatchedAt"=now() WHERE id=ANY($1::uuid[])', [plan.activeOrderIds]);
    await client.query('UPDATE "Order" SET "isDelivered" = (status IN (\'completed\',\'completedAccountant\'))');
    await client.query('UPDATE "Order" SET "isPaid"=true WHERE status IN (\'completed\',\'completedAccountant\')');
    await client.query('COMMIT');
    console.log(JSON.stringify({ applied: true, items: plan.baseline.length, allocations: plan.allocations.length, fingerprint }));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
main().catch(error => { console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
