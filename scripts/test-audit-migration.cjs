/* Synthetic PostgreSQL data in memory. Never loads .env or contacts the store DB. */
const { PGlite } = require('@electric-sql/pglite');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  const baseline = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'docs/audit-2026-09-12/schema-before.prisma', '--script'], { encoding: 'utf8' });
  const db = new PGlite();
  try {
    await db.exec(baseline);
    const productId = '00000000-0000-0000-0000-000000000001';
    const orderId = '00000000-0000-0000-0000-000000000002';
    const userId = '00000000-0000-0000-0000-000000000003';
    const batchId = '00000000-0000-0000-0000-000000000004';
    await db.query('INSERT INTO "Product" (id,name,slug,images,description,stock,colors) VALUES ($1,\'Synthetic product\',\'synthetic\',ARRAY[]::text[],\'Test\',10,ARRAY[]::text[])', [productId]);
    await db.query('INSERT INTO "User" (id,email,"updatedAt") VALUES ($1,\'synthetic@example.invalid\',now())', [userId]);
    await db.query('INSERT INTO "Order" (id,"fullName","phoneNumber",governorate,address,quantity,"userId","totalPrice",status) VALUES ($1,\'Synthetic\',\'07000000000\',\'Baghdad\',\'Test\',1,$2,30,\'completed\')', [orderId, userId]);
    await db.query('INSERT INTO "OrderItem" ("orderId","productId",qty,price,name,slug,image,"costPrice") VALUES ($1,$2,1,30,\'Synthetic\',\'synthetic\',\'image\',10)', [orderId, productId]);
    await db.query('INSERT INTO "ProductBatch" (id,"productId",quantity,"costPrice") VALUES ($1,$2,10,10)', [batchId, productId]);
    await db.exec(fs.readFileSync('prisma/migrations/202609120001_audit_foundations/migration.sql', 'utf8'));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "OrderItem"')).rows[0].count, 1);
    assert.equal(Number((await db.query('SELECT "totalPrice" FROM "Order"')).rows[0].totalPrice), 30);
    await assert.rejects(db.query('DELETE FROM "Product" WHERE id=$1', [productId]));
    await db.query('DELETE FROM "User" WHERE id=$1', [userId]);
    assert.equal((await db.query('SELECT "userId" FROM "Order"')).rows[0].userId, null);
    await db.query('INSERT INTO "InventoryAllocation" (id,"orderId","productId","batchId",quantity,"unitCost") VALUES (\'allocation\',$1,$2,$3,1,10)', [orderId, productId, batchId]);
    await assert.rejects(db.query('DELETE FROM "ProductBatch" WHERE id=$1', [batchId]));
    await assert.rejects(db.query('DELETE FROM "Order" WHERE id=$1', [orderId]));
    await db.exec('INSERT INTO "ShippingSettings" ("updatedAt") VALUES (now())');
    const shipping = (await db.query('SELECT "baghdadCost","othersCost" FROM "ShippingSettings"')).rows[0];
    assert.equal(Number(shipping.baghdadCost), 4);
    assert.equal(Number(shipping.othersCost), 5);
    console.log('PASS: migration preserves historical orders, restricts destructive deletes, unlinks deleted users, and keeps shipping defaults in thousands. Synthetic PostgreSQL only.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
