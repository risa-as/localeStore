const { PGlite } = require('@electric-sql/pglite');
const { createTestPrisma } = require('./pglite-prisma.cjs');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function main() {
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  const db = new PGlite();
  const prisma = createTestPrisma(db);
  const cache = new Map();
  function load(file) {
    file = path.resolve(file.endsWith('.ts') ? file : file + '.ts');
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = name => name === '@/db/prisma' ? { prisma } : name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports, require: localRequire, Date, Map, Set, console }, { filename: file });
    return module.exports;
  }
  try {
    await db.exec(schema);
    const product = await prisma.product.create({ data: { name: 'Lifecycle test', slug: 'lifecycle', images: [], colors: [], description: 'Synthetic only', stock: 3, price: 30, costPrice: 99 } });
    await prisma.productBatch.create({ data: { productId: product.id, quantity: 1, costPrice: 10, createdAt: new Date('2026-01-01') } });
    await prisma.productBatch.create({ data: { productId: product.id, quantity: 2, costPrice: 20, createdAt: new Date('2026-02-01') } });
    const orders = [];
    for (let i = 0; i < 3; i++) orders.push(await prisma.order.create({ data: { fullName: 'Synthetic', phoneNumber: '07000000000', address: 'Test', governorate: 'Baghdad', quantity: 1, totalPrice: 30, orderitems: { create: { productId: product.id, qty: 1, name: 'Synthetic', slug: 'lifecycle', image: 'image', price: 30, costPrice: 99 } } } }));
    const { setOrderStatus } = load('lib/orders/status-service.ts');
    const [a, b, c] = orders;
    await setOrderStatus(a.id, 'pending', 'test');
    await setOrderStatus(b.id, 'pending', 'test');
    await setOrderStatus(a.id, 'returned', 'test');
    assert.equal(await prisma.inventoryAllocation.count({ where: { orderId: a.id, returnedAt: null } }), 1);
    await setOrderStatus(a.id, 'returnReceived', 'test');
    await setOrderStatus(c.id, 'pending', 'test');
    const costOf = async id => Number((await prisma.orderItem.findFirstOrThrow({ where: { orderId: id } })).costTotal);
    assert.equal(await costOf(b.id), 20);
    assert.equal(await costOf(c.id), 10);
    assert.equal(await prisma.messageOutbox.count({ where: { orderId: a.id } }), 1);
    await setOrderStatus(a.id, 'returnReceived', 'test');
    assert.equal(await prisma.messageOutbox.count({ where: { orderId: a.id } }), 1);
    await assert.rejects(setOrderStatus(c.id, 'home', 'test'));
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: c.id } })).status, 'pending');
    console.log('PASS: real Prisma/PostgreSQL lifecycle, frozen costs, physical return, rollback and one return inquiry. No external messages.');
  } finally { await prisma.$disconnect(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
