// Synthetic PostgreSQL checkout integration. In-memory only; customer notifications mocked.
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
  const cache = new Map(), notifications = [];
  function load(file) {
    file = path.resolve(file.endsWith('.ts') ? file : fs.existsSync(file + '.ts') ? file + '.ts' : path.join(file, 'index.ts'));
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const localRequire = name => name === '@/db/prisma' ? { prisma }
      : name === '@/lib/whatsapp' ? { sendOrderConfirmation: async data => { notifications.push(data); } }
      : name.startsWith('@/') ? load(name.slice(2)) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
      { module, exports: module.exports, require: localRequire, Date, Map, Set, console, process }, { filename: file });
    return module.exports;
  }
  try {
    await db.exec(schema);
    const { submitQuickOrder, submitQuickOrderItems } = load('lib/orders/quick-order.ts');
    const product = await prisma.product.create({ data: { name: 'Synthetic product', slug: 'synthetic-social', images: [], colors: [], description: 'Synthetic only', stock: 5, price: 20, shippingPrice: 5, costPrice: 4, offers: 'سعر القطعتين 35 الف' } });
    const data = { fullName: 'زبون', phoneNumber: '07701234567', governorate: 'Baghdad', address: 'Synthetic address', quantity: 2, selectedColor: '' };
    const receipt = key => ({ requestKey: key, pageId: 'test-page', platform: 'facebook', conversationId: 'test-conversation', createdBy: 'test-admin' });
    const options = key => ({ canMerge: async () => true, receipt: receipt(key) });
    const first = await submitQuickOrder(data, product.id, options('first'));
    let order = await prisma.order.findUniqueOrThrow({ where: { id: first.orderId }, include: { orderitems: true } });
    assert.equal(first.kind, 'created'); assert.equal(order.fullName, 'زبون'); assert.equal(order.status, 'home');
    assert.equal(Number(order.totalPrice), 40); assert.equal(Number(order.actualShippingCost), 4);
    assert.equal(order.userId, null); assert.equal(order.orderitems[0].qty, 2); assert(order.reservationExpiresAt > new Date());
    assert.equal(notifications.length, 1);
    const duplicate = await submitQuickOrder({ ...data, quantity: 3 }, product.id, options('second'));
    assert.equal(duplicate.orderId, first.orderId); assert.equal(duplicate.kind, 'duplicate');
    assert.equal((await prisma.orderItem.findFirstOrThrow({ where: { orderId: first.orderId } })).qty, 2);
    assert.equal(notifications.length, 1);
    const another = await prisma.product.create({ data: { name: 'Another product', slug: 'another-social', images: [], colors: [], description: 'Synthetic', stock: 5, price: 10, shippingPrice: 3, costPrice: 2 } });
    const merged = await submitQuickOrder({ ...data, quantity: 1, address: 'Different destination' }, another.id, options('third'));
    order = await prisma.order.findUniqueOrThrow({ where: { id: first.orderId }, include: { orderitems: true } });
    assert.equal(merged.kind, 'merged'); assert.equal(order.orderitems.length, 2); assert.equal(Number(order.totalPrice), 50);
    assert.equal(order.address, 'Synthetic address'); assert.match(order.notes, /Different destination/); assert.equal(notifications.length, 2);
    await prisma.order.update({ where: { id: first.orderId }, data: { status: 'pending' } });
    const replay = await submitQuickOrder(data, product.id, options('first'));
    assert.equal(replay.orderId, first.orderId); assert.equal(replay.replay, true); assert.equal(notifications.length, 2);
    await assert.rejects(submitQuickOrder({ ...data, quantity: 4 }, product.id, options('first')), /ببيانات مختلفة/);
    await assert.rejects(submitQuickOrder({ ...data, phoneNumber: '07801234567', quantity: 4 }, '12345678-1234-4123-8123-123456789012', options('missing-product')), /لم يعد متاحاً/);
    assert.equal(await prisma.order.count(), 1); assert.equal(await prisma.socialInboxOrder.count(), 3);
    await assert.rejects(submitQuickOrder({ ...data, address: ' ' }, product.id, options('incomplete')));
    const colored = await prisma.product.create({ data: { name: 'Colored', slug: 'colored-social', images: [], colors: ['أسود'], description: 'Synthetic', stock: 1, price: 5, costPrice: 1 } });
    await assert.rejects(submitQuickOrder({ ...data, quantity: 1, selectedColor: 'أبيض' }, colored.id, options('wrong-color')), /لون/);
    assert.equal(await prisma.socialInboxOrder.count(), 3);
    assert.equal(notifications.length, 2);
    // The landing caller also uses this service; its access callback must still be respected.
    const landingData = { ...data, phoneNumber: '07901234567', quantity: 1 };
    const landing = await submitQuickOrder(landingData, another.id, { canMerge: async () => false });
    const landingDup = await submitQuickOrder(landingData, another.id, { canMerge: async () => true });
    assert.equal(landingDup.orderId, landing.orderId); assert.equal(landingDup.kind, 'duplicate');
    const otherBrowser = await submitQuickOrder(landingData, another.id, { canMerge: async () => false });
    assert.notEqual(otherBrowser.orderId, landing.orderId);
    await prisma.order.update({ where: { id: otherBrowser.orderId }, data: { isArchived: true } });
    const afterArchive = await submitQuickOrder(landingData, another.id, { canMerge: async () => true });
    assert.equal(afterArchive.orderId, landing.orderId);
    await assert.rejects(submitQuickOrder({ ...landingData, quantity: 0 }, another.id, { canMerge: async () => true }));
    const customer = { fullName: 'زبون', phoneNumber: '07801234567', governorate: 'Baghdad', address: 'Synthetic multi-product address' };
    const lines = [{ productId: product.id, quantity: 2 }, { productId: colored.id, quantity: 2, selectedColor: 'أسود' }];
    const beforeMultiOrders = await prisma.order.count(), beforeMultiNotifications = notifications.length;
    const combined = await submitQuickOrderItems(customer, lines, options('multi-create'));
    assert.equal(combined.kind, 'created');
    assert.equal(await prisma.order.count(), beforeMultiOrders + 1);
    let combinedOrder = await prisma.order.findUniqueOrThrow({ where: { id: combined.orderId }, include: { orderitems: true } });
    assert.equal(combinedOrder.quantity, 4); assert.equal(combinedOrder.orderitems.length, 2);
    assert.equal(Number(combinedOrder.shippingPrice), 5); assert.equal(Number(combinedOrder.totalPrice), 50);
    assert.equal(combinedOrder.orderitems.find(item => item.productId === colored.id).selectedColor, 'أسود');
    // This store keeps taking orders when stock is short. The colored item has stock=1.
    assert.equal(combinedOrder.orderitems.find(item => item.productId === colored.id).qty, 2);
    assert.equal(notifications.length, beforeMultiNotifications + 1);
    assert.equal(notifications.at(-1).quantity, 4);
    assert.match(notifications.at(-1).product, /Synthetic product/); assert.match(notifications.at(-1).product, /Colored/);
    const repeated = await submitQuickOrderItems(customer, [...lines].reverse(), options('multi-create'));
    assert.equal(repeated.orderId, combined.orderId); assert.equal(repeated.replay, true);
    const combinedMerge = await submitQuickOrderItems(customer, [{ productId: product.id, quantity: 4 }, { productId: another.id, quantity: 2 }], options('multi-merge'));
    assert.equal(combinedMerge.orderId, combined.orderId); assert.equal(combinedMerge.kind, 'merged');
    combinedOrder = await prisma.order.findUniqueOrThrow({ where: { id: combined.orderId }, include: { orderitems: true } });
    assert.equal(combinedOrder.orderitems.length, 3); assert.equal(combinedOrder.quantity, 6); assert.equal(Number(combinedOrder.totalPrice), 70);
    assert.equal(combinedOrder.orderitems.find(item => item.productId === product.id).qty, 2);
    const combinedDuplicate = await submitQuickOrderItems(customer, lines, options('multi-duplicate'));
    assert.equal(combinedDuplicate.kind, 'duplicate'); assert.equal(notifications.length, beforeMultiNotifications + 2);
    await assert.rejects(submitQuickOrderItems({ ...customer, phoneNumber: '07801234568' }, [lines[0], { ...lines[1], selectedColor: 'أبيض' }], options('multi-invalid')), /لون/);
    assert.equal(await prisma.order.count(), beforeMultiOrders + 1);
    assert.equal(await prisma.socialInboxOrder.findUnique({ where: { requestKey: 'multi-invalid' } }), null);
    // Fail after adding items to an existing order: the entire merge rolls back.
    const extra = await prisma.product.create({ data: { name: 'Extra', slug: 'extra-social', images: [], colors: [], description: 'Synthetic', stock: 5, price: 7 } });
    await prisma.product.update({ where: { id: colored.id }, data: { isArchived: true } });
    await assert.rejects(submitQuickOrderItems(customer, [{ productId: extra.id, quantity: 1 }], options('multi-rollback')), /لم يعد متاحاً/);
    combinedOrder = await prisma.order.findUniqueOrThrow({ where: { id: combined.orderId }, include: { orderitems: true } });
    assert.equal(combinedOrder.orderitems.length, 3); assert.equal(Number(combinedOrder.totalPrice), 70);
    assert.equal(await prisma.socialInboxOrder.findUnique({ where: { requestKey: 'multi-rollback' } }), null);
    assert.equal(notifications.length, beforeMultiNotifications + 2);
    console.log('PASS: shared checkout, offers, stock policy, multi-product pricing, single shipping/notification, duplicate merge, durable retry and atomic rollback. Synthetic data only.');
  } finally { await prisma.$disconnect(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
