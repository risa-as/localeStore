import { prisma } from "@/db/prisma";
import { STOCK_CONSUMED_STATUSES } from "./constants/order-statuses";

/**
 * المخزون المتاح للبيع.
 *
 * `Product.stock` ليس الكمية المتبقية — هو مجموع كميات الدفعات المستلمة
 * (انظر الثابتة في product.actions: `Product.stock == SUM(batch.quantity)`).
 * الكمية الفعلية على الرف = stock ناقص ما خرج من المستودع، والخروج يُشتق من
 * حالة الطلب الحالية عبر STOCK_CONSUMED_STATUSES (لذلك يعيد الإرجاع الكمية
 * تلقائياً بلا أي كتابة).
 *
 * هذه هي نفس معادلة عمود «المتبقي» في /admin/products — وُضعت هنا حتى لا
 * تتفرّع النسخ وتختلف الصفحات في معنى «المتبقي»، وهو بالضبط ما يحذّر منه
 * lib/constants/order-statuses.ts.
 */

/** الكميات التي خرجت من المستودع لكل منتج (بلا تقييد = كل المنتجات) */
export async function getSoldQuantities(
  productIds?: string[],
): Promise<Map<string, number>> {
  const items = await prisma.orderItem.findMany({
    where: {
      ...(productIds && productIds.length > 0
        ? { productId: { in: productIds } }
        : {}),
      order: { status: { in: STOCK_CONSUMED_STATUSES } },
    },
    select: { productId: true, qty: true },
  });

  const sold = new Map<string, number>();
  for (const item of items) {
    sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.qty);
  }
  return sold;
}

/**
 * الكمية المعروضة للزبون — لا تنزل تحت الصفر حتى لا تظهر أرقام سالبة في الواجهة
 * (صفحة الإدارة تعرض السالب عمداً للتنبيه إلى خلل جرد).
 */
export async function getAvailableStock(
  productId: string,
  stock: number,
): Promise<number> {
  const sold = await getSoldQuantities([productId]);
  const held = await prisma.orderItem.aggregate({ where: { productId, order: { status: "home", reservationExpiresAt: { gt: new Date() } } }, _sum: { qty: true } });
  return Math.max(0, (stock ?? 0) - (sold.get(productId) ?? 0) - (held._sum.qty ?? 0));
}

/** Batch lookup for admin pickers: the same formula without two queries per row. */
export async function getAvailableStocks(products: { id: string; stock: number }[]): Promise<Map<string, number>> {
  if (!products.length) return new Map();
  const ids = products.map(product => product.id);
  const [sold, held] = await Promise.all([
    getSoldQuantities(ids),
    prisma.orderItem.groupBy({ by: ["productId"], where: { productId: { in: ids },
      order: { status: "home", reservationExpiresAt: { gt: new Date() } } }, _sum: { qty: true } }),
  ]);
  const reservations = new Map(held.map(item => [item.productId, item._sum.qty || 0]));
  return new Map(products.map(product => [product.id,
    Math.max(0, product.stock - (sold.get(product.id) || 0) - (reservations.get(product.id) || 0))]));
}
