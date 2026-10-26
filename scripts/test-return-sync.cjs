// Synthetic PostgreSQL and a fake carrier listing only. No live database or customer sends.
const { PGlite } = require('@electric-sql/pglite');
const { createTestPrisma } = require('./pglite-prisma.cjs');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

async function main() {
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  const db = new PGlite();
  const prisma = createTestPrisma(db);
  const cache = new Map();
  let remoteRows = [];
  let networkReads = 0;
  function load(file) {
    file = path.resolve(file.endsWith('.ts') ? file : file + '.ts');
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = name => {
      if (name === '@/db/prisma') return { prisma };
      if (name === 'next/cache') return { revalidatePath() {} };
      if (name === 'next/server') return { NextResponse: { json: (data, options) => new Response(JSON.stringify(data), options) }, after() { throw new Error('Unexpected message-processing side effect in test'); } };
      if (name === '@/lib/whatsapp') return { getWaConfig: () => ({ appSecret: 'synthetic-secret' }), toLocalPhone: () => '07000000000' };
      if (name === '@/lib/whatsapp-tenant') return { resolveInboundOwnership: async () => ({ owned: true }) };
      if (name === '@/lib/authorization') return { requireStaff: async () => ({ user: { role: 'admin' } }) };
      if (name === '@/lib/orders/message-outbox') return { processReturnOutbox() { throw new Error('Never send messages in this test'); } };
      if (name === '@/lib/utils') return { formatError(error) { return { success: false, formError: error.message }; } };
      if (name === '@/lib/delivery') return { getDeliveryProvider: () => load('lib/delivery/providers/modon.ts').modonProvider };
      if (name.startsWith('@/')) return load(name.slice(2));
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
      return require(name);
    };
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
      module, exports: module.exports, require: localRequire, Date, Map, Set, console, Buffer, Response,
      process: { env: { MODON_TOKEN: 'synthetic-not-a-real-token' } },
      fetch: async (url, options) => {
        assert.equal(new URL(url).pathname, '/v1/merchant/merchant-orders');
        assert.equal(options.method || 'GET', 'GET');
        networkReads++;
        return { ok: true, json: async () => remoteRows };
      },
    }, { filename: file });
    return module.exports;
  }
  try {
    await db.exec(schema);
    const product = await prisma.product.create({ data: { name: 'Synthetic return sync', slug: 'synthetic-return-sync', images: [], colors: [], description: 'Test', stock: 100, price: 30, costPrice: 10 } });
    const orders = [];
    for (const rawStatus of ['15', '17', '32', '25']) {
      const trackingId = 'test-' + rawStatus;
      orders.push(await prisma.order.create({ data: { fullName: 'Synthetic', phoneNumber: '07000000000', governorate: 'Baghdad', address: 'Test', quantity: 1, totalPrice: 30, status: 'pending', deliveryTrackingId: trackingId, inventoryDispatchedAt: new Date(), orderitems: { create: { productId: product.id, qty: 1, name: 'Synthetic', slug: product.slug, image: 'test', price: 30, costPrice: 10 } } } }));
      remoteRows.push({ id: trackingId, status_id: rawStatus });
    }
    const { syncModonOrders } = load('lib/orders/internal-operations.ts');
    const first = await syncModonOrders();
    assert.equal(first.success, true);
    assert.equal(first.updatedOrders, 4);
    const states = await Promise.all(orders.map(o => prisma.order.findUniqueOrThrow({ where: { id: o.id } })));
    assert.deepEqual(states.map(o => o.status), ['returned', 'returnReceived', 'failed', 'failed']);
    assert.equal(await prisma.messageOutbox.count(), 4);
    assert.equal(await prisma.messageOutbox.count({ where: { orderId: orders[2].id } }), 1);
    assert.equal(await prisma.orderStatusEvent.count({ where: { source: 'courier-sync' } }), 4);
    assert.equal((await syncModonOrders()).updatedOrders, 0);
    assert.equal(await prisma.messageOutbox.count(), 4);
    remoteRows = remoteRows.map(o => o.status_id === '15' ? { ...o, status_id: '17' } : o);
    assert.equal((await syncModonOrders()).updatedOrders, 1);
    assert.equal(await prisma.messageOutbox.count(), 4);
    assert.equal(networkReads, 3);

    // A normal (non-quoted) customer reply must also link to a failed order.
    const failed = orders[2];
    await prisma.messageOutbox.updateMany({ where: { orderId: failed.id }, data: { status: 'accepted' } });
    const { POST } = load('app/api/whatsapp/webhook/route.ts');
    const rawBody = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: 'synthetic-reply-1', from: '9647000000000', timestamp: String(Math.floor(Date.now() / 1000) + 2), type: 'text', text: { body: 'السعر غالي' } }] } }] }] });
    const request = () => new Request('https://synthetic.invalid/api/whatsapp/webhook', { method: 'POST', body: rawBody, headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'synthetic-secret').update(rawBody).digest('hex') } });
    assert.equal((await POST(request())).status, 200);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: failed.id } })).returnReasonText, 'السعر غالي');
    assert.equal((await prisma.waMessage.findUniqueOrThrow({ where: { waMessageId: 'synthetic-reply-1' } })).orderId, failed.id);
    await POST(request());
    assert.equal((await prisma.waConversation.findUniqueOrThrow({ where: { phone: '07000000000' } })).unreadCount, 1);
    const { saveReturnReason } = load('lib/actions/follow-up.actions.ts');
    const reason = new FormData(); reason.set('id', failed.id); reason.set('reason', 'price');
    await saveReturnReason(reason);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: failed.id } })).returnReasonCode, 'price');

    // The same unique inquiry survives recovery, failure again, and physical return.
    const { setOrderStatus } = load('lib/orders/status-service.ts');
    for (const status of ['rescheduled', 'failed', 'returned', 'returnReceived']) await setOrderStatus(failed.id, status, 'admin-edit');
    assert.equal(await prisma.messageOutbox.count({ where: { orderId: failed.id } }), 1);
    assert.equal((await prisma.messageOutbox.findFirstOrThrow({ where: { orderId: failed.id } })).status, 'accepted');
    const manual = await prisma.order.create({ data: { fullName: 'Synthetic', phoneNumber: '07000000000', governorate: 'Baghdad', address: 'Test', quantity: 1, totalPrice: 30, status: 'pending', inventoryDispatchedAt: new Date(), orderitems: { create: { productId: product.id, qty: 1, name: 'Synthetic', slug: product.slug, image: 'test', price: 30, costPrice: 10 } } } });
    await setOrderStatus(manual.id, 'failed', 'admin-edit');
    assert.equal(await prisma.messageOutbox.count({ where: { orderId: manual.id } }), 1);
    console.log('PASS: real local sync queues one inquiry for 15/17/32/25; manual failure works; repeats and later returns do not duplicate; failed-order replies link, deduplicate and accept reason classification. Synthetic data; no messages sent.');
  } finally { await prisma.$disconnect(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
