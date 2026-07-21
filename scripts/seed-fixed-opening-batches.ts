import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Brings the remaining stragglers into the batch system by giving each one an
 * opening batch of a fixed size (default 10).
 *
 * Targets products that have NO batch at all — i.e. the ones the normal opening
 * seed skipped because their remaining was zero or negative.
 *
 * Why it also rewrites `stock`:
 *   The products page derives remaining as `stock − sold`, while the batches
 *   page derives it from the batch itself. A batch created now starts a fresh
 *   FEFO era, so every past sale falls before it and the batch reads full — the
 *   batch page would show QTY. For the products page to agree we need
 *   `stock − sold == QTY`, so stock is set to `sold + QTY`.
 *
 *   For the oversold products this is a correction, not a fudge: their stock was
 *   already wrong (restocked without being recorded), which is exactly why
 *   remaining went negative. `sold + QTY` restates it truthfully as
 *   "everything that has gone out, plus what is on the shelf today".
 *
 * Dry run (default):  npx tsx scripts/seed-fixed-opening-batches.ts
 * Execute:            npx tsx scripts/seed-fixed-opening-batches.ts --apply
 */

const QTY = 10;

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../db/prisma");
  const { STOCK_CONSUMED_STATUSES } = await import(
    "../lib/constants/order-statuses"
  );

  const [products, soldItems] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        stock: true,
        costPrice: true,
        batches: { select: { id: true } },
      },
    }),
    prisma.orderItem.findMany({
      where: { order: { status: { in: STOCK_CONSUMED_STATUSES } } },
      select: { productId: true, qty: true },
    }),
  ]);

  const soldMap = new Map<string, number>();
  for (const i of soldItems)
    soldMap.set(i.productId, (soldMap.get(i.productId) ?? 0) + i.qty);

  const targets = products.filter((p) => p.batches.length === 0);

  console.log(
    apply
      ? "\n⚙️  التنفيذ الفعلي — سيتم الكتابة في قاعدة البيانات\n"
      : "\n🔍 عرض تجريبي فقط — لن تتغيّر قاعدة البيانات (أضِف --apply للتنفيذ)\n",
  );
  console.log(`المنتجات بلا دفعات: ${targets.length}\n`);
  console.log("=".repeat(92));

  let zeroCost = 0;

  for (const p of targets) {
    const sold = soldMap.get(p.id) ?? 0;
    const before = p.stock - sold;
    const newStock = sold + QTY;
    const cost = Number(p.costPrice);
    if (cost <= 0) zeroCost++;

    console.log(
      `${p.name.trim()}\n` +
        `   المتبقي قبل: ${String(before).padStart(5)}  →  بعد: ${QTY}` +
        `   |  المخزون: ${p.stock} → ${newStock}` +
        `   |  الدفعة: ${QTY} قطعة @ ${(cost * 1000).toLocaleString()} د.ع` +
        (cost <= 0 ? "   ⚠️ تكلفة صفر" : ""),
    );

    if (apply) {
      await prisma.$transaction([
        prisma.productBatch.create({
          data: {
            productId: p.id,
            batchNumber: "1",
            quantity: QTY,
            costPrice: p.costPrice,
            notes: "دفعة افتتاحية بكمية ثابتة — جرد يدوي",
          },
        }),
        prisma.product.update({
          where: { id: p.id },
          data: { stock: newStock },
        }),
      ]);
    }
  }

  console.log("=".repeat(92));
  console.log(
    apply
      ? `\n✅ تم إنشاء ${targets.length} دفعة وتصحيح المخزون.`
      : `\nسيتم إنشاء ${targets.length} دفعة عند التنفيذ.`,
  );
  if (zeroCost > 0) {
    console.log(
      `\n⚠️  ${zeroCost} منتج تكلفته صفر — دفعاتها ستُسجَّل بتكلفة صفر،\n` +
        `    ما يجعل ربحها يبدو أعلى من الحقيقة. صحّح سعر التكلفة ثم عدّل الدفعة.`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
