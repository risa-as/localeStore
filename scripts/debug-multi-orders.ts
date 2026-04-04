import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../db/prisma");

  const orders = await prisma.order.findMany({
    where: { status: "completed" },
    select: {
      id: true, totalPrice: true, shippingPrice: true, governorate: true,
      orderitems: { select: { name: true, price: true, qty: true, costPrice: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const multi = orders.filter((o) => o.orderitems.length > 1);
  console.log("Multi-product completed orders:", multi.length);

  for (const o of multi.slice(0, 5)) {
    const itemsTotal = o.orderitems.reduce(
      (s, i) => s + Number(i.price) * i.qty, 0
    );
    const shipping = Number(o.shippingPrice);
    const productRev = Number(o.totalPrice) - shipping;
    console.log("---");
    console.log(
      `totalPrice:${Number(o.totalPrice)} shipping:${shipping} productRev:${productRev} itemsSum:${itemsTotal}`
    );
    for (const item of o.orderitems) {
      const raw = Number(item.price) * item.qty;
      const share = itemsTotal > 0 ? (raw / itemsTotal) * productRev : 0;
      console.log(
        ` - ${item.name?.substring(0, 25)} | price:${Number(item.price)} x${item.qty} | raw:${raw} | share:${share.toFixed(0)}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
