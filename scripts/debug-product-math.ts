import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PRODUCTS = [
  "فاتح قاعدة فيت بام سيارة امريكي",
  "بكج السباكة الاحترافي",
  "كتر متعدد الاستعمالات",
  "يدة ضاغطة بريكات",
  "بلايس ازالة الفيش",
  "كبان ليزري",
];

async function main() {
  const { prisma } = await import("../db/prisma");

  const toIraqDay = (iso: string, endOfDay: boolean) => {
    const [y, m, day] = iso.split("-").map(Number);
    if (endOfDay) return new Date(Date.UTC(y, m - 1, day, 20, 59, 59, 999));
    return new Date(Date.UTC(y, m - 1, day - 1, 21, 0, 0, 0));
  };

  const startDate = toIraqDay("2026-03-16", false);
  const endDate = toIraqDay("2026-03-19", true);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: startDate, lte: endDate }, status: "completed" },
    select: {
      id: true,
      totalPrice: true,
      shippingPrice: true,
      orderitems: {
        select: { name: true, price: true, qty: true, costPrice: true, shippingPrice: true },
      },
    },
  });

  for (const productName of PRODUCTS) {
    const relevantOrders = orders.filter((o) =>
      o.orderitems.some((i) => i.name === productName)
    );

    let totalQty = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let discountedOrders = 0;

    console.log(`\n${"=".repeat(65)}`);
    console.log(`المنتج: ${productName}`);
    console.log(`عدد الطلبات: ${relevantOrders.length}`);

    // Group identical orders (same totalPrice + shippingPrice + item config)
    type Group = {
      count: number; qty: number; catalogPrice: number; costPrice: number;
      shippingPaid: number; orderTotal: number; actualProductRev: number; share: number;
    };
    const groups = new Map<string, Group>();

    for (const o of relevantOrders) {
      const rawSum = o.orderitems.reduce((s, i) => s + Number(i.price) * i.qty, 0);
      const shippingPaid = Number(o.shippingPrice) > 0
        ? Number(o.shippingPrice)
        : (o.orderitems.length > 0 ? Math.max(...o.orderitems.map(i => Number(i.shippingPrice))) : 0);
      const orderProductRev = Number(o.totalPrice) - shippingPaid;

      const targetItem = o.orderitems.find((i) => i.name === productName)!;
      const rawRevenue = Number(targetItem.price) * targetItem.qty;
      const share = rawSum > 0 ? (rawRevenue / rawSum) * orderProductRev : rawRevenue;
      const cost = Number(targetItem.costPrice) * targetItem.qty;
      const catalogRev = Number(targetItem.price) * targetItem.qty;

      // Check if discount exists
      if (Math.abs(share - catalogRev) > 0.01) discountedOrders++;

      totalQty += targetItem.qty;
      totalRevenue += share;
      totalCost += cost;

      const key = `${Number(o.totalPrice)}_${shippingPaid}_${targetItem.qty}_${Number(targetItem.costPrice)}_${o.orderitems.length}`;
      const g = groups.get(key);
      if (g) {
        g.count++;
      } else {
        groups.set(key, {
          count: 1,
          qty: targetItem.qty,
          catalogPrice: Number(targetItem.price),
          costPrice: Number(targetItem.costPrice),
          shippingPaid,
          orderTotal: Number(o.totalPrice),
          actualProductRev: orderProductRev,
          share,
        });
      }
    }

    console.log("-".repeat(65));
    console.log(`${"طريقة الحساب:".padEnd(20)} productRev = Order.totalPrice - Order.shippingPrice`);
    console.log(`${"".padEnd(20)} للمنتج الواحد: share = (price×qty / sum_all) × productRev`);
    console.log("-".repeat(65));

    // Sort groups by count desc
    const sortedGroups = Array.from(groups.values()).sort((a, b) => b.count - a.count);

    for (const g of sortedGroups) {
      const discountNote = Math.abs(g.share - g.catalogPrice * g.qty) > 0.01
        ? ` ← خصم! كتالوج=${g.catalogPrice * g.qty} فعلي=${g.share.toFixed(4)}`
        : "";

      console.log(
        `  ${String(g.count).padStart(3)} طلب × ` +
        `[totalPrice:${g.orderTotal} - shipping:${g.shippingPaid} = productRev:${g.actualProductRev}]` +
        ` | qty:${g.qty} | share/طلب:${g.share.toFixed(4)} | cost/طلب:${g.costPrice * g.qty}${discountNote}`
      );
    }

    if (discountedOrders > 0) {
      console.log(`⚠️  ${discountedOrders} طلب فيه خصم (totalPrice < price×qty + shipping)`);
    }

    console.log(`${"─".repeat(50)}`);
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : "0";
    console.log(`الكمية  = ${totalQty}`);
    console.log(`الإيراد = ${totalRevenue.toFixed(4)}K = ${(totalRevenue * 1000).toFixed(2)} د.ع`);
    console.log(`التكلفة = ${totalCost.toFixed(4)}K = ${(totalCost * 1000).toFixed(2)} د.ع`);
    console.log(`الربح   = ${(totalRevenue - totalCost).toFixed(4)}K = ${((totalRevenue - totalCost) * 1000).toFixed(2)} د.ع`);
    console.log(`الهامش  = ${margin}%`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
