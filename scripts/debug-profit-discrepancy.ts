import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Read-only diagnostic: explains why a product's "سعر بيع الوحدة (صافي)" on the
 * profit page differs from its catalog price on the products page.
 *
 * For each product it prints every contributing order line: the frozen
 * OrderItem.price snapshot, the order's totalPrice / shippingPrice /
 * actualShippingCost, and the proportional share the profit page assigns.
 *
 * Run: npx tsx scripts/debug-profit-discrepancy.ts
 */

const PRODUCTS = [
  "سيت فخات صدر سيارة",
  "سيت تركيب المكبس",
  "كابسة حلقات",
];

const REVENUE_STATUSES = ["completed", "completedAccountant"];

async function main() {
  const { prisma } = await import("../db/prisma");

  // Same default window as the profit page: start of current month → now.
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const toIraqDay = (d: Date, endOfDay: boolean) => {
    const iso = new Date(d).toISOString().split("T")[0];
    const [y, m, day] = iso.split("-").map(Number);
    if (endOfDay) return new Date(Date.UTC(y, m - 1, day, 20, 59, 59, 999));
    return new Date(Date.UTC(y, m - 1, day - 1, 21, 0, 0, 0));
  };
  const startDate = toIraqDay(startOfMonth, false);
  const endDate = toIraqDay(now, true);

  console.log(
    `\nنافذة التحليل: ${startDate.toISOString()} → ${endDate.toISOString()}\n`,
  );

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      status: { in: REVENUE_STATUSES },
    },
    select: {
      id: true,
      createdAt: true,
      totalPrice: true,
      shippingPrice: true,
      actualShippingCost: true,
      orderitems: {
        select: { name: true, price: true, qty: true, costPrice: true },
      },
    },
  });

  console.log(`إجمالي الطلبات المكتملة في الفترة: ${orders.length}\n`);

  for (const productName of PRODUCTS) {
    const product = await prisma.product.findFirst({
      where: { name: productName },
      select: { price: true, costPrice: true, shippingPrice: true },
    });

    const relevant = orders.filter((o) =>
      o.orderitems.some((i) => i.name === productName),
    );

    console.log("=".repeat(78));
    console.log(`المنتج: ${productName}`);
    console.log(
      `الكتالوج الحالي → السعر: ${Number(product?.price ?? 0) * 1000} | ` +
        `التكلفة: ${Number(product?.costPrice ?? 0) * 1000} | ` +
        `التوصيل: ${Number(product?.shippingPrice ?? 0) * 1000}`,
    );
    console.log(`عدد الطلبات المساهِمة: ${relevant.length}`);
    console.log("-".repeat(78));

    let totalQty = 0;
    let totalRevenue = 0;

    for (const o of relevant) {
      const item = o.orderitems.find((i) => i.name === productName)!;
      const rawItemsTotal = o.orderitems.reduce(
        (s, i) => s + Number(i.price) * i.qty,
        0,
      );
      const actualShipping = Number(o.actualShippingCost);
      const orderNetRevenue = Number(o.totalPrice) - actualShipping;
      const rawRevenue = Number(item.price) * item.qty;
      const share =
        rawItemsTotal > 0
          ? (rawRevenue / rawItemsTotal) * orderNetRevenue
          : rawRevenue;

      totalQty += item.qty;
      totalRevenue += share;

      const snapshot = Number(item.price) * 1000;
      const catalog = Number(product?.price ?? 0) * 1000;
      const priceChanged = Math.abs(snapshot - catalog) > 0.01;

      console.log(
        `  طلب ${o.id.slice(0, 8)} (${o.createdAt.toISOString().slice(0, 10)}) ` +
          `أصناف:${o.orderitems.length}`,
      );
      console.log(
        `    سعر السطر المُجمَّد: ${snapshot} × ${item.qty}` +
          (priceChanged ? `   ⚠️ يختلف عن الكتالوج (${catalog})` : "   ✓ = الكتالوج"),
      );
      console.log(
        `    totalPrice: ${Number(o.totalPrice) * 1000} | ` +
          `التوصيل المحصَّل: ${Number(o.shippingPrice) * 1000} | ` +
          `التوصيل الفعلي: ${actualShipping * 1000} | ` +
          `هامش التوصيل: ${(Number(o.shippingPrice) - actualShipping) * 1000}`,
      );
      console.log(
        `    حصة المنتج من الإيراد الصافي: ${(share * 1000).toFixed(0)}`,
      );
      if (o.orderitems.length > 1) {
        console.log(
          `    ⚠️ طلب متعدد الأصناف: ${o.orderitems
            .map((i) => `${i.name}(${Number(i.price) * 1000}×${i.qty})`)
            .join(" + ")}`,
        );
      }
    }

    console.log("-".repeat(78));
    console.log(
      `  الكمية: ${totalQty} | الإيراد: ${(totalRevenue * 1000).toFixed(0)} | ` +
        `سعر الوحدة الصافي: ${totalQty > 0 ? ((totalRevenue / totalQty) * 1000).toFixed(0) : 0}`,
    );
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
