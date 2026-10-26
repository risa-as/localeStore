// Accounting regression tests in an isolated PostgreSQL database; no Meta requests.
const { PGlite } = require('@electric-sql/pglite');
const { createTestPrisma } = require('./pglite-prisma.cjs');
const { execFileSync } = require('node:child_process');
const { transformSync } = require('esbuild');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
(async () => {
  const schema = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
  const db = new PGlite(), prisma = createTestPrisma(db);
  try {
    await db.exec(schema);
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync('lib/meta/adspend-storage.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code,
      { module, exports: module.exports, require: name => name === '@/db/prisma' ? { prisma } : require(name), Date, Map, Set, JSON });
    const { persistDailySpend, saveCampaignProductLink } = module.exports;
    const product = async slug => prisma.product.create({ data: { name: slug, slug, images: [], colors: [], description: 'Synthetic accounting test', stock: 0, price: 0, costPrice: 0 } });
    const [unlinked, a, b] = await Promise.all([product('unlinked'), product('a'), product('b')]);
    const input = { productId: unlinked.id, campaignId: 'test-campaign', date: new Date('2026-10-05'), amount: 10, currency: 'USD', amountIQD: 13700, fxRate: 1370, campaignName: 'Synthetic' };
    await persistDailySpend(input);
    assert.equal(await saveCampaignProductLink({ campaignId: input.campaignId, productId: a.id }), 1);
    let row = await prisma.adSpendDaily.findFirstOrThrow();
    assert.equal(row.productId, a.id); assert.equal(Number(row.amount), 10); assert.equal(Number(row.fxRate), 1370);
    // A sync that started with a stale unlinked mapping must respect the newer manual link.
    await persistDailySpend({ ...input, amount: 12, amountIQD: 16440 });
    assert.equal(await prisma.adSpendDaily.count(), 1);
    row = await prisma.adSpendDaily.findFirstOrThrow(); assert.equal(row.productId, a.id); assert.equal(Number(row.amount), 12);
    await saveCampaignProductLink({ campaignId: input.campaignId, productId: b.id });
    await prisma.adSpendDaily.create({ data: { ...input, amount: 9, amountIQD: 12330 } });
    // An authoritative fresh observation replaces duplicates; they are never added together.
    await persistDailySpend({ ...input, amount: 13, amountIQD: 17810 });
    assert.equal(await prisma.adSpendDaily.count(), 1);
    row = await prisma.adSpendDaily.findFirstOrThrow(); assert.equal(row.productId, b.id); assert.equal(Number(row.amount), 13);
    // Conflicting historical observations must not be silently discarded by a mapping edit.
    await prisma.adSpendDaily.create({ data: input });
    await assert.rejects(saveCampaignProductLink({ campaignId: input.campaignId, productId: a.id }), /متعارض/);
    assert.equal((await prisma.campaignProductMap.findUniqueOrThrow({ where: { campaignId: input.campaignId } })).productId, b.id);
    assert.equal(await prisma.adSpendDaily.count(), 2);
    console.log('PASS: historical reclassification, original FX preservation, stale-map protection, retry without doubling, authoritative duplicate replacement and atomic conflict rollback.');
  } finally { await prisma.$disconnect(); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
