/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test harness. */
// Real Prisma queries against synthetic PostgreSQL only. No network or customer sends.
const { PGlite } = require('@electric-sql/pglite');
const { createTestPrisma } = require('./pglite-prisma.cjs');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

async function main() {
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  const db = new PGlite();
  const prisma = createTestPrisma(db);
  const fixed = new Date('2026-10-25T12:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixed.getTime()])); }
    static now() { return fixed.getTime(); }
  }
  try {
    await db.exec(schema);
    const order = (extra = {}) => ({ id: crypto.randomUUID(), fullName: 'زبون', phoneNumber: '07701234567', governorate: 'بغداد', address: 'عنوان تجريبي', quantity: 1, totalPrice: 20000, ...extra });
    const day = 86400000;
    const rows = Array.from({ length: 65 }, (_, i) => order({ status: ['pending', 'failed', 'rescheduled', 'returned'][i % 4], deliverySentAt: new Date(fixed - (6 + i) * day), deliveryTrackingId: 'test-' + i }));
    const reasons = Array.from({ length: 35 }, (_, i) => order({ status: ['failed', 'returned', 'returnReceived'][i % 3], returnReasonText: 'السعر غالي', createdAt: new Date(fixed - i * day) }));
    const excluded = [
      order({ status: 'pending', deliverySentAt: new Date(fixed - 5 * day) }),
      order({ status: 'pending', deliverySentAt: new Date(fixed - 4 * day) }),
      ...['home', 'completed', 'completedAccountant', 'returnReceived'].map(status => order({ status, deliverySentAt: new Date(fixed - 10 * day) })),
      order({ status: 'returned', deliverySentAt: null }),
      order({ status: 'returned', returnReasonText: 'غالي', returnReasonCode: 'price' }),
      order({ status: 'home', returnReasonText: 'غالي' }),
    ];
    await prisma.order.createMany({ data: [...rows, ...reasons, ...excluded] });
    const messages = Array.from({ length: 60 }, (_, i) => ({ id: 'recent-' + i, orderId: rows[0].id, eventKey: 'recent-' + i, template: 'order_returned', payload: {}, status: 'delivered', createdAt: new Date(fixed - i * 1000) }));
    const review = Array.from({ length: 52 }, (_, i) => ({ id: 'review-' + i, orderId: rows[1].id, eventKey: 'review-' + i, template: 'order_returned', payload: {}, status: i % 2 ? 'failed' : 'review', createdAt: new Date(fixed - (80 + i) * day) }));
    const pending = ['queued', 'sending'].map((status, i) => ({ id: 'pending-' + i, orderId: rows[2].id, eventKey: 'pending-' + i, template: 'order_returned', payload: {}, status }));
    await prisma.messageOutbox.createMany({ data: [...messages, ...review, ...pending] });
    await prisma.waConversation.createMany({ data: [{ phone: '07700000001', unreadCount: 2 }, { phone: '07700000002', unreadCount: 1 }, { phone: '07700000003', unreadCount: 0 }] });
    const policy = require('node:path').resolve('lib/orders/return-inquiry.ts');
    const policyModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(policy, 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: policyModule, exports: policyModule.exports });
    const inboxPolicyModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync('lib/whatsapp-inbox-filters.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: inboxPolicyModule, exports: inboxPolicyModule.exports });
    const dataModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync('lib/follow-up.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
      module: dataModule, exports: dataModule.exports, Date: FixedDate,
      require(name) {
        if (name === '@/db/prisma') return { prisma };
        if (name === '@/lib/orders/return-inquiry') return policyModule.exports;
        if (name === '@/lib/whatsapp-inbox-filters') return inboxPolicyModule.exports;
        throw new Error('Unexpected dependency ' + name);
      },
    });
    const { getFollowUpData } = dataModule.exports;
    const data = await getFollowUpData({});
    assert.equal(data.unread, 2); // Conversations, not unread message count.
    assert.equal(data.needsReview, 52); // Includes failures older than the latest 50 successes.
    assert.equal(data.queued, 2);
    assert.equal(data.messageTotal, 114);
    assert.equal(data.reasonsCount, 35);
    assert.equal(data.shipmentsCount, 65);
    assert.equal(data.outbox.length, 10);
    assert(data.outbox.every(item => ['failed', 'review'].includes(item.status)));
    assert.equal(data.returns.length, 10);
    assert.equal(data.delayed.length, 12);
    assert.equal(data.delayed[0].deliveryTrackingId, 'test-64'); // Oldest dispatch first.
    const next = await getFollowUpData({ messagePage: '2', reasonsPage: '2', shipmentsPage: '2' });
    assert.equal(next.outbox.length, 10);
    assert.equal(next.returns.length, 10);
    assert.equal(next.delayed.length, 12);
    for (const key of ['outbox', 'returns', 'delayed']) assert(!next[key].some(item => data[key].some(first => first.id === item.id)), 'No duplicates between pages: ' + key);
    const last = await getFollowUpData({ messages: 'all', messagePage: '999', reasonsPage: '999', shipmentsPage: '999' });
    assert.equal(last.messagePage, 12);
    assert.equal(last.outbox.length, 4);
    assert.equal(last.shipmentsPage, 6);
    assert.equal(last.delayed.length, 5);
    assert.equal(last.reasonsPage, 4);
    const invalid = await getFollowUpData({ messages: 'invalid', messagePage: '-2', reasonsPage: 'NaN', shipmentsPage: '1.2' });
    assert.equal(invalid.messageFilter, 'review');
    assert.equal(invalid.messagePage, 1);
    assert.equal(invalid.reasonsPage, 1);
    assert.equal(invalid.shipmentsPage, 1);
    const queued = await getFollowUpData({ messages: 'pending' });
    assert.equal(queued.filteredCount, 2);
    assert.equal(queued.outbox.length, 2);
    assert(queued.outbox.every(item => ['queued', 'sending'].includes(item.status)));
    assert.equal(await prisma.order.count(), rows.length + reasons.length + excluded.length);
    assert.equal(await prisma.messageOutbox.count(), 114);
    await prisma.messageOutbox.deleteMany();
    await prisma.waConversation.deleteMany();
    await prisma.order.deleteMany();
    const empty = await getFollowUpData({ messagePage: '999', reasonsPage: '999', shipmentsPage: '999' });
    assert.equal(empty.messagePage, 1);
    assert.equal(empty.reasonsPage, 1);
    assert.equal(empty.shipmentsPage, 1);
    assert.equal(empty.messageTotal + empty.reasonsCount + empty.shipmentsCount + empty.unread, 0);
    console.log('PASS: complete counts, old failures visible, all filters, 5-day boundary, excluded states, oldest shipments first, pagination/clamping, empty results; synthetic DB only.');
  } finally { await prisma.$disconnect(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
