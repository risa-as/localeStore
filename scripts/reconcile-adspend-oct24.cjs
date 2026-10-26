// Scoped repair from the reviewed Meta daily snapshot. Dry run unless --apply.
require('@next/env').loadEnvConfig(process.cwd(), true);
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { prisma } = require('../db/prisma.ts');
const { buildCampaignProductMap } = require('../lib/meta/adspend.ts');
const folder = 'docs/audit-2026-10-24';
const before = JSON.parse(fs.readFileSync(`${folder}/adspend-before.json`, 'utf8'));
const planFile = `${folder}/adspend-repair-plan.json`;
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const cents = n => Math.round(Number(n) * 100);
const fingerprint = rows => rows.map(row => [row.id, row.productId, row.campaignId, new Date(row.date).toISOString().slice(0, 10), cents(row.amount), row.currency, cents(row.amountIQD), Number(row.fxRate)])
  .sort((a, b) => a[0].localeCompare(b[0]));
(async () => {
  try {
    if (plan.applied) { console.log('Repair already applied; no writes.'); return; }
    assert.equal(before.errors.length, 0);
    assert.equal(before.duplicateKeys.length, 0);
    assert.equal(plan.changes.length, 25);
    assert.equal(plan.proposed.length, 72);
    const mapping = await buildCampaignProductMap();
    for (const row of plan.proposed) assert.equal(mapping.get(row.campaignId)?.productId, row.productId, 'Mapping changed; repeat the audit');
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ apply: false, changes: plan.changes.length })); return; }
    await prisma.$transaction(async tx => {
      for (const campaignId of [...new Set(plan.changes.map(row => row.campaignId))].sort())
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`adspend:${campaignId}`}, 0))`;
      const current = await tx.adSpendDaily.findMany({ where: { date: { gte: new Date(plan.scope.from), lte: new Date(plan.scope.to) } } });
      assert.deepEqual(fingerprint(current), fingerprint(before.stored), 'Stored spend changed; repeat the audit');
      const rates = await tx.fxRate.findMany({ orderBy: { fromDate: 'desc' } });
      const rateFingerprint = rows => rows.map(row => [row.id, Number(row.rate), new Date(row.fromDate).toISOString(), row.toDate ? new Date(row.toDate).toISOString() : null]);
      assert.deepEqual(rateFingerprint(rates), rateFingerprint(before.rates), 'FX periods changed');
      for (const proposed of plan.changes) {
        const data = { ...proposed, date: new Date(`${proposed.date}T00:00:00.000Z`) };
        const old = current.find(row => row.campaignId === data.campaignId && row.date.toISOString().slice(0, 10) === proposed.date);
        if (old) await tx.adSpendDaily.update({ where: { id: old.id }, data });
        else await tx.adSpendDaily.create({ data });
      }
    }, { timeout: 60000 });
    const after = await prisma.adSpendDaily.findMany({ where: { date: { gte: new Date(plan.scope.from), lte: new Date(plan.scope.to) } }, include: { product: { select: { name: true } } } });
    assert.equal(after.length, 72);
    for (const expected of plan.proposed) {
      const row = after.find(row => row.campaignId === expected.campaignId && row.date.toISOString().slice(0, 10) === expected.date);
      assert(row); assert.equal(row.productId, expected.productId); assert.equal(cents(row.amount), cents(expected.amount)); assert.equal(cents(row.amountIQD), cents(expected.amountIQD));
    }
    plan.applied = true; plan.appliedAt = new Date().toISOString();
    plan.afterSummary = { rows: after.length, usd: after.reduce((sum, row) => sum + cents(row.amount), 0) / 100,
      iqd: after.reduce((sum, row) => sum + cents(row.amountIQD), 0) / 100 };
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
    fs.writeFileSync(`${folder}/adspend-after.json`, JSON.stringify(after, null, 2));
    console.log(JSON.stringify({ applied: true, ...plan.afterSummary, magnetic: after.filter(row => row.productId === 'ea3e9c5b-0d46-4778-a97a-5fec532ea96c').reduce((sum, row) => sum + cents(row.amount), 0) / 100,
      unclassifiedRows: after.filter(row => row.product.name === 'غير مصنّف (حملات بلا ربط)').length }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
})();
