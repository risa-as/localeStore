import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../db/prisma");

  // Search for the Nasriya order
  const orders = await prisma.order.findMany({
    where: {
      fullName: { contains: "ضياء", mode: "insensitive" },
    },
    select: {
      id: true,
      fullName: true,
      totalPrice: true,
      shippingPrice: true,
      governorate: true,
      status: true,
      createdAt: true,
      orderitems: {
        select: { name: true, price: true, qty: true, costPrice: true },
      },
    },
  });

  console.log(`Found ${orders.length} orders for ضياء`);
  for (const o of orders) {
    const itemsTotal = o.orderitems.reduce(
      (s, i) => s + Number(i.price) * i.qty,
      0
    );
    console.log("---");
    console.log(
      `${o.fullName} | status:${o.status} | gov:${o.governorate} | totalPrice:${Number(o.totalPrice)} | shippingPrice:${Number(o.shippingPrice)} | created:${o.createdAt.toISOString()}`
    );
    console.log(`  OrderItems count: ${o.orderitems.length} | itemsSum: ${itemsTotal}`);
    for (const item of o.orderitems) {
      console.log(
        `  - "${item.name}" | price:${Number(item.price)} x${item.qty} | costPrice:${Number(item.costPrice)}`
      );
    }
  }

  // Also check: any order with 3+ items
  const allCompleted = await prisma.order.findMany({
    where: { status: "completed" },
    select: {
      id: true,
      totalPrice: true,
      shippingPrice: true,
      orderitems: { select: { name: true, price: true, qty: true } },
    },
  });
  const multiProduct = allCompleted.filter((o) => o.orderitems.length > 1);
  console.log(`\nTotal completed orders: ${allCompleted.length}`);
  console.log(`Multi-product completed: ${multiProduct.length}`);

  // Show any with price=0 items
  const zeroPrice = allCompleted.filter((o) =>
    o.orderitems.some((i) => Number(i.price) === 0)
  );
  console.log(`Completed orders with price=0 items: ${zeroPrice.length}`);
  for (const o of zeroPrice.slice(0, 3)) {
    console.log(
      `  Order ${o.id.slice(0, 8)} totalPrice:${Number(o.totalPrice)}`
    );
    for (const i of o.orderitems) {
      console.log(`    - ${i.name?.substring(0, 25)} price:${Number(i.price)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
