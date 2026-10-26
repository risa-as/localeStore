// Isolated PostgreSQL tests. No network calls, customer messages or production writes.
const { PGlite } = require('@electric-sql/pglite');
const { createTestPrisma } = require('./pglite-prisma.cjs');
const { transformSync } = require('esbuild');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async () => {
  const db = new PGlite(), prisma = createTestPrisma(db);
  try {
    await db.exec(fs.readFileSync('prisma/migrations/202610240002_social_inbox_delivery/migration.sql', 'utf8'));
    const modules = new Map();
    const load = file => {
      if (modules.has(file)) return modules.get(file).exports;
      const module = { exports: {} }; modules.set(file, module);
      vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, Date, Map, Set, JSON, Buffer,
        require: name => name === '@/db/prisma' ? { prisma } : name === './inbox-delivery' ? load('lib/meta/inbox-delivery.ts') : require(name),
      });
      return module.exports;
    };
    const { saveInboxReceiptEvent, applyInboxDelivery } = load('lib/meta/inbox-delivery-storage.ts');
    const ctx = { pageId: 'test-page', platform: 'facebook' }, recipientId = 'test-peer';
    const early = new Date('2026-10-24T10:00:00Z'), later = new Date('2026-10-24T11:00:00Z');
    const base = { ...ctx, recipientId, deliveredMids: [], readMids: [], at: later };
    await saveInboxReceiptEvent({ ...base, readThrough: later });
    await saveInboxReceiptEvent({ ...base, readThrough: early, deliveredThrough: early, deliveredMids: ['m1'] });
    await saveInboxReceiptEvent({ ...base, readThrough: early });
    const peer = await prisma.socialInboxPeerReceipt.findFirstOrThrow();
    assert.equal(peer.readThrough.toISOString(), later.toISOString());
    assert.equal(await prisma.socialInboxPeerReceipt.count(), 1);
    const item = { id: 'm1', handle: '', title: 'Page', text: 'Synthetic', time: early.toISOString(), outgoing: true };
    assert.equal((await applyInboxDelivery(ctx, recipientId, [item]))[0].deliveryStatus, 'read');
    assert.equal((await applyInboxDelivery(ctx, 'another-peer', [item]))[0].deliveryStatus, 'sent');
    assert.equal((await applyInboxDelivery({ ...ctx, pageId: 'another-page' }, recipientId, [item]))[0].deliveryStatus, 'sent');
    const ig = { ...base, platform: 'instagram', readMids: ['ig-mid'], deliveredMids: [] };
    await saveInboxReceiptEvent(ig);
    await saveInboxReceiptEvent({ ...ig, at: early, readMids: [], deliveredMids: ['ig-mid'] });
    const igItem = { ...item, id: 'ig-mid', time: later.toISOString() };
    assert.equal((await applyInboxDelivery(ig, recipientId, [igItem]))[0].deliveryStatus, 'read');
    assert.equal((await applyInboxDelivery(ig, recipientId, [{ ...igItem, id: 'other-mid' }]))[0].deliveryStatus, 'sent');
    console.log('PASS: actual migration, monotonic/out-of-order watermarks and mids, duplicate callbacks, platform/Page/peer isolation, no fabricated IG receipt.');
  } finally { await prisma.$disconnect(); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
