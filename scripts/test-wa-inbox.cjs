/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS integration harness. */
// Synthetic PostgreSQL only. Network and message sends are forbidden.
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
  const now = new Date('2026-10-25T12:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }
  let authorized = true, reads = 0;
  const guardedPrisma = new Proxy(prisma, { get(target, key) {
    const model = target[key];
    if (model && typeof model === 'object' && !String(key).startsWith('$')) return new Proxy(model, { get(model, operation) {
      const method = model[operation];
      if (typeof method !== 'function') return method;
      return (...args) => { reads++; return method.apply(model, args); };
    } });
    return model;
  } });
  const cache = new Map();
  function load(file) {
    file = path.resolve(file.endsWith('.ts') ? file : file + '.ts');
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} }; cache.set(file, loaded);
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
      module: loaded, exports: loaded.exports, Date: FixedDate, console,
      process: { env: {} },
      fetch() { throw Error('No network allowed in this test'); },
      require(name) {
        if (name === '@/db/prisma') return { prisma: guardedPrisma };
        if (name === '@/lib/authorization') return { requireStaff: async () => { if (!authorized) throw Error('revoked'); return { user: { role: 'admin' } }; } };
        if (name.startsWith('@/')) return load(name.slice(2));
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
        return require(name);
      },
    }, { filename: file });
    return loaded.exports;
  }
  try {
    await db.exec(schema);
    const rows = Array.from({ length: 131 }, (_, i) => ({
      id: 'c' + i, phone: '077' + String(10000000 + i), customerName: (i >= 100 && i < 111 ? 'أقدم ' : 'عميل ') + i,
      unreadCount: i < 7 ? i % 3 + 1 : i >= 100 && i < 111 ? 2 : 0,
      lastMessageAt: new Date(now - i * 86400000),
      windowExpiresAt: i < 7 || i === 8 || (i >= 100 && i < 110) ? new Date(+now + 3600000) : i === 7 ? now : i % 2 ? null : new Date(+now - 3600000),
    }));
    await prisma.waConversation.createMany({ data: rows });
    const { WA_TEMPLATE_BODY_PREFIX } = load('lib/whatsapp.ts');
    await prisma.waMessage.createMany({ data: [
      { conversationId: 'c0', waMessageId: 'r1', direction: 'out', type: 'template', body: WA_TEMPLATE_BODY_PREFIX.returned + ' test' },
      { conversationId: 'c110', waMessageId: 'r2', direction: 'out', type: 'template', body: WA_TEMPLATE_BODY_PREFIX.returned + ' test' },
      { conversationId: 'c110', waMessageId: 'r3', direction: 'out', type: 'template', body: WA_TEMPLATE_BODY_PREFIX.returned + ' test' },
      { conversationId: 'c5', waMessageId: 'a1', direction: 'out', type: 'template', body: WA_TEMPLATE_BODY_PREFIX.confirmation + ' test' },
      { conversationId: 'c105', waMessageId: 'a2', direction: 'out', type: 'template', body: WA_TEMPLATE_BODY_PREFIX.confirmation + ' test' },
    ] });
    const { getWaInbox, getWaConversations, getWaThread } = load('lib/actions/whatsapp.actions.ts');
    const { getFollowUpData } = load('lib/follow-up.ts');
    const all = await getWaInbox();
    assert.equal(all.counts.all, 131);
    assert.equal(all.conversations.length, 100);
    assert.equal(all.conversations.filter(c => c.unreadCount > 0).length, 7); // Reproduces the original discrepancy.
    assert.equal(all.counts.unread, 18);
    assert.equal(all.counts.open, 18);
    assert.equal(all.counts.closed, 113);
    const unread = await getWaInbox(undefined, undefined, 'unread');
    assert.equal(unread.conversations.length, 18);
    assert(unread.conversations.some(c => c.id === 'c110'));
    assert(unread.conversations.every(c => c.unreadCount > 0));
    assert.equal((await getFollowUpData({})).unread, unread.counts.unread);
    assert(rows.reduce((sum, row) => sum + row.unreadCount, 0) > unread.counts.unread); // Messages and conversations differ.
    assert.equal((await getWaConversations(undefined, undefined, 'unread')).length, 18);
    const open = await getWaInbox(undefined, undefined, 'open');
    assert.equal(open.conversations.length, 18);
    assert(open.conversations.some(c => c.id === 'c109'));
    assert(!open.conversations.some(c => c.id === 'c7')); // Exactly expired means closed.
    const closed = await getWaInbox(undefined, undefined, 'closed');
    assert.equal(closed.counts.closed, 113);
    assert.equal(closed.conversations.length, 100);
    assert(closed.conversations.some(c => c.id === 'c7'));
    const template = await getWaInbox(undefined, 'returned', 'unread');
    assert.equal(template.conversations.length, 2); // Count conversations, even after multiple templates.
    assert.equal(template.counts.all, 2);
    assert.equal(template.counts.unread, 2);
    assert.equal(template.templateCounts.returned, 2);
    const searched = await getWaInbox('  أقدم  ', 'returned', 'unread');
    assert.equal(searched.counts.all, 1);
    assert.equal(searched.conversations[0].id, 'c110');
    assert.equal(searched.templateCounts.confirmation, 1);
    assert.equal(searched.templateCounts.returned, 1);
    const empty = await getWaInbox('not present', undefined, 'unread');
    assert.equal(empty.conversations.length, 0);
    assert.equal(empty.counts.all + empty.counts.unread + empty.counts.open + empty.counts.closed, 0);
    const invalid = await getWaInbox(undefined, 'toString', 'unknown');
    assert.equal(invalid.selection.filter, 'all');
    assert.equal(invalid.selection.template, 'all');
    authorized = false;
    const readsBefore = reads;
    await assert.rejects(() => getWaInbox(), /revoked/);
    assert.equal(reads, readsBefore);
    authorized = true;
    await getWaThread('c110'); // Marks only this synthetic conversation as read.
    assert.equal((await getWaInbox(undefined, undefined, 'unread')).counts.unread, 17);
    assert.equal((await getFollowUpData({})).unread, 17);
    assert.equal(await prisma.waConversation.count(), 131);
    assert.equal(await prisma.waMessage.count(), 5); // No outbound message was created.
    console.log('PASS: reproduces 18 total vs 7 within latest 100; all 18 unread and older open conversations retrieved; both page counts agree; combined search/template/status filters; expiry boundary; auth; read updates; no network/sends.');
  } finally { await prisma.$disconnect(); await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
