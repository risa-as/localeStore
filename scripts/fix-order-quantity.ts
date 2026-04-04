import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../db/prisma");

  // Fetch all orders with their items
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      quantity: true,
      orderitems: { select: { qty: true } },
    },
  });

  let fixedCount = 0;
  let skippedCount = 0;

  for (const order of orders) {
    const actualQty = order.orderitems.reduce((sum, item) => sum + item.qty, 0);

    if (actualQty === 0) {
      skippedCount++;
      continue;
    }

    if (order.quantity !== actualQty) {
      await prisma.order.update({
        where: { id: order.id },
        data: { quantity: actualQty },
      });
      console.log(`Fixed order ${order.id.slice(0, 8)}: ${order.quantity} → ${actualQty}`);
      fixedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\nDone: ${fixedCount} fixed, ${skippedCount} already correct`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
