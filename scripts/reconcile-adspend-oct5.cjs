// Scoped repair for the confirmed 2026-10-05 FX boundary omission.
// Dry run by default: node --require tsx/cjs scripts/reconcile-adspend-oct5.cjs
// Apply only the three missing historical rows with --apply. No Meta writes.
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { prisma } = require("../db/prisma.ts");
const { listAdAccounts, fetchCampaignSpendForDate, fxRateForDate, buildCampaignProductMap } = require("../lib/meta/adspend.ts");
const expected = new Map([["120247087554310037", 9.96], ["120248243531640570", 18.22], ["120251499871400308", 6.36]]);
const cents = value => Math.round(Number(value) * 100);
const day = new Date("2026-10-05T00:00:00.000Z");

(async () => {
  try {
    const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
    if (!conn?.userAccessToken) throw new Error("Meta connection missing");
    const fx = await fxRateForDate(day);
    if (fx?.rate !== 1370) throw new Error("Expected the owner's 1370 rate for October 5");
    const names = new Set(["F12", "R51", "R52", "R54", "R56", "R57"]);
    const accounts = (await listAdAccounts(conn.userAccessToken)).filter(account => names.has(account.name?.trim()));
    if (accounts.length !== 6 || accounts.some(account => account.currency !== "USD")) throw new Error("Unexpected account scope or currency");
    const mapping = await buildCampaignProductMap();
    const actual = [];
    for (const account of accounts) {
      const rows = await fetchCampaignSpendForDate(account.id, conn.userAccessToken, "2026-10-05");
      actual.push(...rows.filter(row => row.spend > 0).map(row => ({ ...row, accountName: account.name })));
    }
    if (actual.length !== 3 || actual.some(row => !expected.has(row.campaignId) || cents(row.spend) !== cents(expected.get(row.campaignId))))
      throw new Error("Live historical spend differs from the reviewed repair; no writes performed");
    const before = await prisma.adSpendDaily.findMany({ where: { date: day, campaignId: { in: [...expected.keys()] } } });
    const planned = actual.map(row => {
      const productId = mapping.get(row.campaignId)?.productId;
      if (!productId || before.some(saved => saved.campaignId === row.campaignId && saved.productId !== productId)) throw new Error("Unexpected product mapping");
      return { productId, campaignId: row.campaignId, date: day, amount: row.spend, currency: "USD",
        amountIQD: cents(row.spend * fx.rate) / 100, fxRate: fx.rate, campaignName: row.campaignName, source: "meta-daily" };
    });
    const report = { createdAt: new Date().toISOString(), reason: "Inclusive FX period end date omitted October 5",
      fxRate: fx.rate, before, planned, applied: false };
    const folder = path.join(process.cwd(), "docs", "audit-2026-10-23");
    fs.mkdirSync(folder, { recursive: true });
    const filename = path.join(folder, `adspend-oct5-${report.createdAt.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    if (process.argv.includes("--apply")) {
      const results = await prisma.$transaction(async tx => {
        const output = [];
        for (const row of planned) {
          output.push(await tx.adSpendDaily.upsert({
            where: { productId_campaignId_date: { productId: row.productId, campaignId: row.campaignId, date: day } },
            create: row, update: { amount: row.amount, amountIQD: row.amountIQD, fxRate: row.fxRate, currency: row.currency, campaignName: row.campaignName },
          }));
        }
        return output;
      });
      report.applied = true; report.after = results;
      fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify({ applied: report.applied, rows: planned.length, usd: actual.reduce((sum, row) => sum + cents(row.spend), 0) / 100,
      iqd: planned.reduce((sum, row) => sum + cents(row.amountIQD), 0) / 100, previousRows: before.length, report: filename }));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, code: error.code }));
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
