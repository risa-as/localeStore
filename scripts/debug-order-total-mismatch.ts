import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Read-only audit: how many completed orders have a `totalPrice` that does not
 * equal `sum(items.price × qty) + shippingPrice`?
 *
 * The profit page treats `totalPrice` as the source of truth (it is what was
 * actually collected) and distributes it across line items, so any mismatch
 * shows up as an inflated or deflated per-unit selling price.
 *
 * Run: npx tsx scripts/debug-order-total-mismatch.ts
 */

const REVENUE_STATUSES = ["completed", "completedAccountant"];

async function main() {
  const { prisma } = await import("../db/prisma");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const toIraqDay = (d: Date, endOfDay: boolean) => {
    const iso = new Date(d).toISOString().split("T")[0];
    const [y, m, day] = iso.split("-").map(Number);
    if (endOfDay) return new Date(Date.UTC(y, m - 1, day, 20, 59, 59, 999));
    return new Date(Date.UTC(y, m - 1, day - 1, 21, 0, 0, 0));
  };

  const orders = await prisma.order.findMany({
    where: {
      createdAt: {
        gte: toIraqDay(startOfMonth, false),
        lte: toIraqDay(now, true),
      },
      status: { in: REVENUE_STATUSES },
    },
    select: {
      id: true,
      createdAt: true,
      totalPrice: true,
      shippingPrice: true,
      deliveryCollectedPrice: true,
      orderitems: { select: { name: true, price: true, qty: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let exact = 0;
  const mismatches: {
    id: string;
    date: string;
    expected: number;
    actual: number;
    diff: number;
    items: string;
    collected: number | null;
  }[] = [];

  for (const o of orders) {
    const itemsTotal = o.orderitems.reduce(
      (s, i) => s + Number(i.price) * i.qty,
      0,
    );
    const expected = itemsTotal + Number(o.shippingPrice);
    const actual = Number(o.totalPrice);
    const diff = actual - expected;

    if (Math.abs(diff) < 0.001) {
      exact++;
    } else {
      mismatches.push({
        id: o.id.slice(0, 8),
        date: o.createdAt.toISOString().slice(0, 10),
        expected: expected * 1000,
        actual: actual * 1000,
        diff: diff * 1000,
        items: o.orderitems
          .map((i) => `${i.name}(${Number(i.price) * 1000}×${i.qty})`)
          .join(" + "),
        collected:
          o.deliveryCollectedPrice === null
            ? null
            : Number(o.deliveryCollectedPrice) * 1000,
      });
    }
  }

  console.log(`\nالطلبات المكتملة في الفترة: ${orders.length}`);
  console.log(`✓ متطابقة (totalPrice = أصناف + توصيل): ${exact}`);
  console.log(`⚠️ غير متطابقة: ${mismatches.length}\n`);

  if (mismatches.length > 0) {
    console.log("=".repeat(100));
    for (const m of mismatches) {
      console.log(
        `${m.id} ${m.date} | متوقع: ${m.expected} | فعلي: ${m.actual} | ` +
          `الفرق: ${m.diff > 0 ? "+" : ""}${m.diff}` +
          (m.collected !== null ? ` | حصّلته شركة التوصيل: ${m.collected}` : ""),
      );
      console.log(`   الأصناف: ${m.items}`);
    }
    console.log("=".repeat(100));
    const totalDiff = mismatches.reduce((s, m) => s + m.diff, 0);
    console.log(`\nمجموع الفروقات: ${totalDiff > 0 ? "+" : ""}${totalDiff} د.ع`);
    console.log(
      `هذا المبلغ يظهر حالياً كإيراد (أو نقص إيراد) موزَّع على المنتجات.`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
