import { prisma } from "@/db/prisma";

export type DailySpendInput = {
  productId: string; campaignId: string; date: Date; amount: number; currency: string;
  amountIQD: number; fxRate: number; campaignName: string | null;
};

/** One observed Meta campaign/day belongs to one product, even after relinking. */
export async function persistDailySpend(input: DailySpendInput) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`adspend:${input.campaignId}`}, 0))`;
    const mapping = await tx.campaignProductMap.findUnique({ where: { campaignId: input.campaignId } });
    const data = { ...input, productId: mapping?.productId || input.productId };
    const existing = await tx.adSpendDaily.findMany({ where: { campaignId: data.campaignId, date: data.date }, orderBy: { createdAt: "desc" } });
    const keeper = existing.find(row => row.productId === data.productId) || existing[0];
    if (keeper) {
      const extras = existing.filter(row => row.id !== keeper.id).map(row => row.id);
      if (extras.length) await tx.adSpendDaily.deleteMany({ where: { id: { in: extras } } });
      await tx.adSpendDaily.update({ where: { id: keeper.id }, data });
    } else await tx.adSpendDaily.create({ data });
  });
}

/** Move saved history with the mapping; never sum duplicate observations. */
export async function saveCampaignProductLink(entry: { campaignId: string; productId: string; campaignName?: string | null }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`adspend:${entry.campaignId}`}, 0))`;
    const rows = await tx.adSpendDaily.findMany({ where: { campaignId: entry.campaignId } });
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.date.toISOString().slice(0, 10);
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    let moved = 0;
    for (const [day, daily] of groups) {
      const values = daily.map(row => JSON.stringify([Number(row.amount), row.currency, Number(row.amountIQD), row.fxRate === null ? null : Number(row.fxRate)]));
      if (new Set(values).size > 1) throw new Error(`صرف متعارض يوم ${day}؛ استرجع صرف الفترة من Meta قبل تغيير الربط`);
      const keeper = daily.find(row => row.productId === entry.productId) || daily[0];
      const extras = daily.filter(row => row.id !== keeper.id).map(row => row.id);
      if (extras.length) await tx.adSpendDaily.deleteMany({ where: { id: { in: extras } } });
      if (keeper.productId !== entry.productId) {
        await tx.adSpendDaily.update({ where: { id: keeper.id }, data: { productId: entry.productId } });
        moved += 1;
      }
    }
    await tx.campaignProductMap.upsert({ where: { campaignId: entry.campaignId },
      create: { ...entry, campaignName: entry.campaignName ?? null },
      update: { productId: entry.productId, campaignName: entry.campaignName ?? null } });
    return moved;
  }, { timeout: 30000 });
}
