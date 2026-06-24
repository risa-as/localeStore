import dotenv from "dotenv";
import path from "path";

// Must run BEFORE prisma is imported
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Seeds one "opening balance" batch per product, so FEFO has on-hand inventory
 * to consume against from day one.
 *
 *  - Quantity   = current remaining = max(0, stock − sold)
 *                 where sold = qty of completed/completedAccountant/pending orders
 *                 (same definition as the المتبقي column on the products page).
 *  - Cost       = the product's current costPrice.
 *  - Added now  = so this opening batch is consumed first (FIFO) before any
 *                 batches you add later.
 *
 * Idempotent: any product that already has at least one batch is skipped, so it
 * is safe to run more than once. Run with:  npx tsx scripts/seed-opening-batches.ts
 */
async function main() {
  const { prisma } = await import("../db/prisma");

  console.log("📦 Seeding opening-balance batches...\n");

  const [products, soldItems, existingBatches] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, name: true, stock: true, costPrice: true },
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: ["completed", "completedAccountant", "pending"] },
        },
      },
      select: { productId: true, qty: true },
    }),
    prisma.productBatch.findMany({ select: { productId: true } }),
  ]);

  const soldMap = new Map<string, number>();
  for (const item of soldItems) {
    soldMap.set(item.productId, (soldMap.get(item.productId) ?? 0) + item.qty);
  }

  const haveBatches = new Set(existingBatches.map((b) => b.productId));

  let created = 0;
  let skippedHasBatches = 0;
  let skippedNoStock = 0;

  for (const product of products) {
    if (haveBatches.has(product.id)) {
      skippedHasBatches++;
      continue;
    }

    const remaining = Math.max(
      0,
      (product.stock ?? 0) - (soldMap.get(product.id) ?? 0),
    );

    if (remaining <= 0) {
      skippedNoStock++;
      continue;
    }

    await prisma.productBatch.create({
      data: {
        productId: product.id,
        batchNumber: "افتتاحية",
        quantity: remaining,
        costPrice: product.costPrice,
        notes: "دفعة افتتاحية أُنشئت تلقائياً من المخزون الحالي",
      },
    });
    created++;
    console.log(`  ✓ ${product.name} — ${remaining} قطعة`);
  }

  console.log("\n" + "─".repeat(50));
  console.log(`✅ Created            : ${created} opening batches`);
  console.log(`⏭  Skipped (has batch): ${skippedHasBatches}`);
  console.log(`⏭  Skipped (no stock) : ${skippedNoStock}`);
  console.log("─".repeat(50));
  console.log("\n✅ Done!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
