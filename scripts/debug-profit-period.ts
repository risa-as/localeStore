import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../db/prisma");

  // Same date logic as getOrderProfitStats (Iraq UTC+3)
  const toIraqDay = (iso: string, endOfDay: boolean) => {
    const [y, m, day] = iso.split("-").map(Number);
    if (endOfDay) return new Date(Date.UTC(y, m - 1, day, 20, 59, 59, 999));
    return new Date(Date.UTC(y, m - 1, day - 1, 21, 0, 0, 0));
  };

  const startDate = toIraqDay("2026-03-16", false);
  const endDate = toIraqDay("2026-03-19", true);
  console.log("Range:", startDate.toISOString(), "→", endDate.toISOString());

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: startDate, lte: endDate }, status: "completed" },
    select: {
      id: true,
      totalPrice: true,
      shippingPrice: true,
      actualShippingCost: true,
      governorate: true,
      orderitems: {
        select: { name: true, price: true, qty: true, costPrice: true, shippingPrice: true },
      },
    },
  });

  console.log(`\nCompleted orders in period: ${orders.length}`);

  let totalRevenue = 0;
  let totalShippingRevenue = 0;
  let totalItemsRevenue = 0;

  const statsMap = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();

  for (const order of orders) {
    const shippingRevenue = Number(order.shippingPrice) > 0
      ? Number(order.shippingPrice)
      : order.orderitems.length > 0 ? Math.max(...order.orderitems.map(i => Number(i.shippingPrice))) : 0;

    const orderProductRevenue = Number(order.totalPrice) - shippingRevenue;
    const rawItemsTotal = order.orderitems.reduce((s, i) => s + Number(i.price) * i.qty, 0);

    totalShippingRevenue += shippingRevenue;
    totalItemsRevenue += orderProductRevenue;
    totalRevenue += Number(order.totalPrice);

    for (const item of order.orderitems) {
      const rawRevenue = Number(item.price) * item.qty;
      const revenue = rawItemsTotal > 0 ? (rawRevenue / rawItemsTotal) * orderProductRevenue : rawRevenue;
      const cost = Number(item.costPrice) * item.qty;

      const existing = statsMap.get(item.name);
      if (existing) {
        existing.qty += item.qty;
        existing.revenue += revenue;
        existing.cost += cost;
      } else {
        statsMap.set(item.name, { name: item.name, qty: item.qty, revenue, cost });
      }
    }
  }

  console.log(`\nTotal orders revenue: ${totalRevenue.toLocaleString()}`);
  console.log(`Total shipping revenue: ${totalShippingRevenue.toLocaleString()}`);
  console.log(`Total product revenue: ${totalItemsRevenue.toLocaleString()}`);

  // Sort by revenue desc
  const stats = Array.from(statsMap.values()).sort((a, b) => b.revenue - a.revenue);

  console.log("\n--- Product Breakdown ---");
  let sumRevenue = 0;
  let sumCost = 0;
  for (const s of stats) {
    const profit = s.revenue - s.cost;
    const margin = s.revenue > 0 ? (profit / s.revenue * 100).toFixed(1) : "0";
    console.log(`${s.name.substring(0, 30)} | qty:${s.qty} | rev:${Math.round(s.revenue).toLocaleString()} | cost:${Math.round(s.cost).toLocaleString()} | profit:${Math.round(profit).toLocaleString()} | margin:${margin}%`);
    sumRevenue += s.revenue;
    sumCost += s.cost;
  }
  console.log(`\nSUM: rev=${Math.round(sumRevenue).toLocaleString()} cost=${Math.round(sumCost).toLocaleString()} profit=${Math.round(sumRevenue - sumCost).toLocaleString()}`);

  // Show multi-product orders
  const multiOrders = orders.filter(o => o.orderitems.length > 1);
  console.log(`\nMulti-product orders: ${multiOrders.length}`);
  for (const o of multiOrders) {
    const shipping = Number(o.shippingPrice);
    const productRev = Number(o.totalPrice) - shipping;
    const rawSum = o.orderitems.reduce((s, i) => s + Number(i.price) * i.qty, 0);
    console.log(`  Order | total:${Number(o.totalPrice)} shipping:${shipping} productRev:${productRev} rawSum:${rawSum}`);
    for (const i of o.orderitems) {
      const raw = Number(i.price) * i.qty;
      const share = rawSum > 0 ? (raw / rawSum) * productRev : 0;
      console.log(`    - ${i.name?.substring(0, 25)} price:${Number(i.price)} x${i.qty} => share:${share.toFixed(2)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
