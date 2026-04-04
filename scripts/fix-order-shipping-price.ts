import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { prisma } = await import("../db/prisma");

  console.log("🔧 Backfilling Order.shippingPrice from OrderItem data...\n");

  // Find all orders where shippingPrice is 0 (not yet set)
  const orders = await prisma.order.findMany({
    where: { shippingPrice: 0 },
    select: {
      id: true,
      totalPrice: true,
      orderitems: {
        select: { shippingPrice: true },
      },
    },
  });

  console.log(`📦 Found ${orders.length} orders to backfill`);

  let fixed = 0;
  let skipped = 0;

  for (const order of orders) {
    if (order.orderitems.length === 0) {
      skipped++;
      continue;
    }

    // Reconstruct shipping = max(item.shippingPrice) — same logic used at order creation
    const shippingPrice = Math.max(
      ...order.orderitems.map((i) => Number(i.shippingPrice)),
    );

    await prisma.order.update({
      where: { id: order.id },
      data: { shippingPrice },
    });
    fixed++;
  }

  console.log(`✅ Fixed shippingPrice for ${fixed} orders`);
  if (skipped > 0) {
    console.log(`⚠️  Skipped ${skipped} orders (no order items)`);
  }

  // Verification: show a sample of the fixed orders
  const sample = await prisma.order.findMany({
    where: { status: "completed" },
    select: {
      id: true,
      totalPrice: true,
      shippingPrice: true,
      governorate: true,
      orderitems: { select: { name: true, qty: true, price: true, shippingPrice: true } },
    },
    take: 5,
    orderBy: { createdAt: "desc" },
  });

  console.log("\n📋 Sample of recent completed orders (verification):");
  for (const o of sample) {
    const itemsTotal = o.orderitems.reduce((s, i) => s + Number(i.price) * i.qty, 0);
    console.log(`  Order ${o.id.slice(0, 8)}... | Gov: ${o.governorate}`);
    console.log(`    totalPrice=${o.totalPrice} | shippingPrice=${o.shippingPrice} | itemsTotal=${itemsTotal}`);
    console.log(`    Check: itemsTotal + shipping = ${itemsTotal + Number(o.shippingPrice)} (should equal totalPrice)`);
    for (const item of o.orderitems) {
      console.log(`    - ${item.name} x${item.qty} @ ${item.price}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
