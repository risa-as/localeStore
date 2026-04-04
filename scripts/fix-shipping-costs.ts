import dotenv from "dotenv";
import path from "path";

// Must run BEFORE prisma is imported
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ─── Shipping Cost Rules ──────────────────────────────────────────────────────
const BAGHDAD_COST = 4;
const OTHERS_COST = 5;
const PROMO_COST = 3;

// Promotion period: Feb 1 – Mar 25 (year 2026)
const PROMO_START = new Date("2026-02-01T00:00:00.000Z");
const PROMO_END = new Date("2026-03-25T23:59:59.999Z");

function getExpectedCost(governorate: string, createdAt: Date): number {
  if (createdAt >= PROMO_START && createdAt <= PROMO_END) {
    return PROMO_COST;
  }
  return governorate === "Baghdad" ? BAGHDAD_COST : OTHERS_COST;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Dynamic import so prisma loads AFTER dotenv has set env vars
  const { prisma } = await import("../db/prisma");

  console.log("🔧 Fixing actualShippingCost for all orders...\n");
  console.log(
    `📅 Promo period: ${PROMO_START.toDateString()} → ${PROMO_END.toDateString()}`,
  );
  console.log(`   During promo : 3,000 د.ع (all governorates)`);
  console.log(`   Outside promo: Baghdad = 4,000 د.ع | Others = 5,000 د.ع\n`);

  const orders = await prisma.order.findMany({
    select: {
      id: true,
      governorate: true,
      createdAt: true,
      actualShippingCost: true,
    },
  });

  console.log(`📦 Total orders found: ${orders.length}\n`);

  let updated = 0;
  let skipped = 0;

  for (const order of orders) {
    const expected = getExpectedCost(order.governorate, order.createdAt);
    const current = Number(order.actualShippingCost);

    if (current === expected) {
      skipped++;
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { actualShippingCost: expected },
    });
    updated++;
  }

  console.log("─".repeat(45));
  console.log(`✅ Updated : ${updated} orders`);
  console.log(`⏭  Skipped : ${skipped} orders (already correct)`);
  console.log("─".repeat(45));
  console.log("\n✅ Done!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
