"use server";
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
  try {
    const parsed = updateBatchSchema.parse(data);
    // عدّل المخزون بفارق الكمية فقط (الجديدة − القديمة).
    const existing = await prisma.productBatch.findUnique({
      where: { id: parsed.id },
      select: { quantity: true },
    });
    const stockDelta = parsed.quantity - (existing?.quantity ?? 0);
    await prisma.$transaction([
      prisma.productBatch.update({
        where: { id: parsed.id },
        data: {
          productId: parsed.productId,
          // رقم الدفعة يُولَّد آلياً ولا يُعدَّل من النموذج — نُبقي القيمة الحالية.
          quantity: parsed.quantity,
          costPrice: parsed.costPrice,
          notes: parsed.notes || null,
        },
      }),
      prisma.product.update({
        where: { id: parsed.productId },
        data: { stock: { increment: stockDelta } },
      }),
    ]);
    revalidateBatchPages();
    return { success: true, message: "تم تحديث الدفعة بنجاح" };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

export async function deleteBatch(id: string) {
  try {
    const existing = await prisma.productBatch.findUnique({
      where: { id },
      select: { quantity: true, productId: true },
    });
    if (!existing) {
      return { success: false, message: "الدفعة غير موجودة" };
    }
    await prisma.$transaction([
      prisma.productBatch.delete({ where: { id } }),
      // اخصم كمية الدفعة من مخزون المنتج
      prisma.product.update({
        where: { id: existing.productId },
        data: { stock: { decrement: existing.quantity } },
      }),
    ]);
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
  const contexts = await buildFefoContexts([productId]);
  return buildRows(contexts);
}

/** Lightweight product list for the batch form select. */
export async function getProductsForBatchSelect(): Promise<
  { id: string; name: string }[]
> {
  const products = await prisma.product.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return products;
}
