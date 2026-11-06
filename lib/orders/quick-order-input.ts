import { z } from "zod";
import { insertOrderSchema } from "@/lib/validators";

export const MAX_QUICK_ORDER_PRODUCTS = 20;
export const quickOrderCustomerSchema = insertOrderSchema.omit({ quantity: true, selectedColor: true });
export const quickOrderLinesSchema = z.array(z.object({
  productId: z.string().uuid().transform(id => id.toLowerCase()),
  quantity: insertOrderSchema.shape.quantity,
  selectedColor: insertOrderSchema.shape.selectedColor,
})).min(1, "أضف منتجاً واحداً على الأقل")
  .max(MAX_QUICK_ORDER_PRODUCTS, `الحد الأقصى ${MAX_QUICK_ORDER_PRODUCTS} منتجاً في المسودة`)
  .refine(items => new Set(items.map(item => item.productId)).size === items.length, "المنتج مكرر؛ عدّل كميته في المسودة")
  .refine(items => items.reduce((sum, item) => sum + item.quantity, 0) <= 2147483647, "إجمالي الكمية أكبر من الحد المسموح");

export type QuickOrderCustomer = z.input<typeof quickOrderCustomerSchema>;
export type QuickOrderLine = z.output<typeof quickOrderLinesSchema>[number];
