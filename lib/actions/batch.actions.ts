"use server";
import { requireAdministrator } from "@/lib/authorization";
import { prisma } from "@/db/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { insertBatchSchema, updateBatchSchema } from "../validators";
import { formatError } from "../utils";
import { buildFefoContexts } from "../fefo-cogs";

function revalidateBatchPages() {
  revalidatePath("/admin/batches");
  revalidatePath("/admin/products");
  revalidatePath("/admin/profit");
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

/** يولّد رقم دفعة تسلسلياً لكل منتج (أكبر رقم رقمي موجود + 1). */
async function nextBatchNumber(productId: string): Promise<string> {
  const existing = await prisma.productBatch.findMany({
    where: { productId },
    select: { batchNumber: true },
  });
  const maxNum = existing.reduce((max, b) => {
    const n = parseInt(b.batchNumber ?? "", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return String(maxNum + 1);
}

export async function createBatch(data: z.infer<typeof insertBatchSchema>) {
  await requireAdministrator();
  try {
    const parsed = insertBatchSchema.parse(data);
    const batchNumber =
      parsed.batchNumber?.trim() || (await nextBatchNumber(parsed.productId));
    await prisma.$transaction([
      prisma.productBatch.create({
        data: {
          productId: parsed.productId,
          batchNumber,
          quantity: parsed.quantity,
          costPrice: parsed.costPrice,
          notes: parsed.notes || null,
        },
      }),
      // أضِف كمية الدفعة إلى مخزون المنتج
      prisma.product.update({
        where: { id: parsed.productId },
        data: { stock: { increment: parsed.quantity } },
      }),
    ]);
    revalidateBatchPages();
    return { success: true, message: "تم إضافة الدفعة بنجاح" };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

export async function updateBatch(data: z.infer<typeof updateBatchSchema>) {
  await requireAdministrator();
  try {
    const parsed = updateBatchSchema.parse(data);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${parsed.productId}::uuid FOR UPDATE`;
      const existing = await tx.productBatch.findUniqueOrThrow({ where: { id: parsed.id } });
      if (existing.productId !== parsed.productId) throw new Error("لا يمكن نقل دفعة إلى منتج آخر");
      const used = await tx.inventoryAllocation.count({ where: { batchId: parsed.id } });
      if (used && (existing.quantity !== parsed.quantity || Number(existing.costPrice) !== Number(parsed.costPrice))) throw new Error("هذه الدفعة مرتبطة بحركات مخزون؛ أضف دفعة أو تسوية مستقلة بدلاً من تغيير تاريخها");
      await tx.productBatch.update({ where: { id: parsed.id }, data: { quantity: parsed.quantity, costPrice: parsed.costPrice, notes: parsed.notes || null } });
      await tx.product.update({ where: { id: existing.productId }, data: { stock: { increment: parsed.quantity - existing.quantity } } });
    });
    revalidateBatchPages();
    return { success: true, message: "تم تحديث الدفعة بنجاح" };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

export async function deleteBatch(id: string) {
  await requireAdministrator();
  try {
    await prisma.$transaction(async tx => {
      const existing = await tx.productBatch.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${existing.productId}::uuid FOR UPDATE`;
      if (await tx.inventoryAllocation.count({ where: { batchId: id } })) throw new Error("لا يمكن حذف دفعة استُخدمت في طلبات");
      await tx.productBatch.delete({ where: { id } });
      await tx.product.update({ where: { id: existing.productId }, data: { stock: { decrement: existing.quantity } } });
    });
    revalidateBatchPages();
    return { success: true, message: "تم حذف الدفعة بنجاح" };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

// ─── Read (with FEFO remaining + expiry status) ──────────────────────────────

export type BatchRow = {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string | null;
  quantity: number;
  remaining: number;
  consumed: number;
  costPrice: number;
  addedDate: string | null;
  notes: string | null;
  valueRemaining: number;
};

export type BatchesSummary = {
  totalBatches: number;
  totalRemainingQty: number;
  totalRemainingValue: number;
  totalConsumed: number;
};

function buildRows(
  contexts: Awaited<ReturnType<typeof buildFefoContexts>>,
): BatchRow[] {
  const items: { row: BatchRow; createdAt: number }[] = [];
  for (const ctx of contexts.values()) {
    for (const b of ctx.batches) {
      const remaining = ctx.batchRemaining.get(b.id) ?? b.quantity;
      const consumed = ctx.batchConsumed.get(b.id) ?? 0;
      items.push({
        createdAt: b.createdAt.getTime(),
        row: {
          id: b.id,
          productId: ctx.productId,
          productName: b.productName,
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          remaining,
          consumed,
          costPrice: b.costPrice,
          addedDate: b.createdAt.toISOString().split("T")[0],
          notes: b.notes,
          valueRemaining: Math.max(0, remaining) * b.costPrice,
        },
      });
    }
  }
  // ترتيب تنازلي حسب وقت الإدخال (الأحدث أولاً).
  items.sort((a, b) => b.createdAt - a.createdAt);
  return items.map((i) => i.row);
}

export async function getAllBatchesWithStatus(): Promise<{
  rows: BatchRow[];
  summary: BatchesSummary;
}> {
  await requireAdministrator();
  const contexts = await buildFefoContexts();
  const rows = buildRows(contexts);

  const summary: BatchesSummary = {
    totalBatches: rows.length,
    totalRemainingQty: rows.reduce((s, r) => s + Math.max(0, r.remaining), 0),
    totalRemainingValue: rows.reduce((s, r) => s + r.valueRemaining, 0),
    totalConsumed: rows.reduce((s, r) => s + r.consumed, 0),
  };

  return { rows, summary };
}

export async function getBatchesByProduct(productId: string): Promise<BatchRow[]> {
  await requireAdministrator();
  const contexts = await buildFefoContexts([productId]);
  return buildRows(contexts);
}

/** Lightweight product list for the batch form select. */
export async function getProductsForBatchSelect(): Promise<
  { id: string; name: string }[]
> {
  await requireAdministrator();
  const products = await prisma.product.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return products;
}
