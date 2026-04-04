import dotenv from "dotenv";
import path from "path";

// Must run BEFORE prisma is imported
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const BAGHDAD_SHIPPING_COST = 4000;
const OTHER_SHIPPING_COST = 5000;

async function main() {
  const { prisma } = await import("../db/prisma");

  console.log("🔧 Starting fix for existing orders...\n");

  // ─── 1. Fix actualShippingCost in Orders ─────────────────────────────────
  const orders = await prisma.order.findMany({
    where: { actualShippingCost: 0, status: { not: "Cancelled" } },
    select: { id: true, governorate: true },
  });

  console.log(`📦 Found ${orders.length} orders with actualShippingCost = 0`);

  let orderFixed = 0;
  for (const order of orders) {
    const cost = order.governorate === "Baghdad" ? BAGHDAD_SHIPPING_COST : OTHER_SHIPPING_COST;
    await prisma.order.update({
      where: { id: order.id },
      data: { actualShippingCost: cost },
    });
    orderFixed++;
  }
  console.log(`✅ Fixed actualShippingCost for ${orderFixed} orders\n`);

  // ─── 2. Fix costPrice in OrderItems ──────────────────────────────────────
  const orderItems = await prisma.orderItem.findMany({
    where: { costPrice: 0 },
    select: { orderId: true, productId: true },
  });

  console.log(`🛒 Found ${orderItems.length} order items with costPrice = 0`);

  const productIds = [...new Set(orderItems.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, costPrice: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let itemsFixed = 0;
  let itemsSkipped = 0;
  for (const item of orderItems) {
    const product = productMap.get(item.productId);
    if (!product || Number(product.costPrice) === 0) {
      itemsSkipped++;
      continue;
    }
    await prisma.orderItem.update({
      where: { orderId_productId: { orderId: item.orderId, productId: item.productId } },
      data: { costPrice: product.costPrice },
    });
    itemsFixed++;
  }

  console.log(`✅ Fixed costPrice for ${itemsFixed} order items`);
  if (itemsSkipped > 0) {
    console.log(`⚠️  Skipped ${itemsSkipped} items (product costPrice is also 0 — set it in the products page first)`);
  }

  console.log("\n✅ Done!");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
