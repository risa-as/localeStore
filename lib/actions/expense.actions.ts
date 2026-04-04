"use server";
import { prisma } from "@/db/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const expenseSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  fromDate: z.string(),
  toDate: z.string(),
  amount: z.coerce.number().positive(),
  notes: z.string().optional().nullable(),
});

const adCampaignSchema = z.object({
  productId: z.string().uuid(),
  fromDate: z.string(),
  toDate: z.string(),
  amount: z.coerce.number().positive(),
  currency: z.string().default("IQD"),
  notes: z.string().optional().nullable(),
});

// ─── Expenses ────────────────────────────────────────────────────────────────

export async function getExpenses() {
  return prisma.expense.findMany({ orderBy: { fromDate: "desc" } });
}

export async function createExpense(data: z.infer<typeof expenseSchema>) {
  try {
    const parsed = expenseSchema.parse(data);
    await prisma.expense.create({
      data: {
        ...parsed,
        fromDate: new Date(parsed.fromDate),
        toDate: new Date(parsed.toDate),
      },
    });
    revalidatePath("/admin/expenses");
    return { success: true };
  } catch {
    return { success: false, message: "فشل حفظ المصروف" };
  }
}

export async function updateExpense(id: string, data: z.infer<typeof expenseSchema>) {
  try {
    const parsed = expenseSchema.parse(data);
    await prisma.expense.update({
      where: { id },
      data: {
        ...parsed,
        fromDate: new Date(parsed.fromDate),
        toDate: new Date(parsed.toDate),
      },
    });
    revalidatePath("/admin/expenses");
    return { success: true };
  } catch {
    return { success: false, message: "فشل تحديث المصروف" };
  }
}

export async function deleteExpense(id: string) {
  try {
    await prisma.expense.delete({ where: { id } });
    revalidatePath("/admin/expenses");
    return { success: true };
  } catch {
    return { success: false, message: "فشل حذف المصروف" };
  }
}

// ─── Ad Campaigns ─────────────────────────────────────────────────────────────

export async function getAdCampaigns() {
  return prisma.adCampaign.findMany({
    orderBy: { fromDate: "desc" },
    include: { product: { select: { name: true } } },
  });
}

export async function createAdCampaign(data: z.infer<typeof adCampaignSchema>) {
  try {
    const parsed = adCampaignSchema.parse(data);
    await prisma.adCampaign.create({
      data: {
        ...parsed,
        fromDate: new Date(parsed.fromDate),
        toDate: new Date(parsed.toDate),
      },
    });
    revalidatePath("/admin/expenses");
    return { success: true };
  } catch {
    return { success: false, message: "فشل حفظ الحملة" };
  }
}

export async function updateAdCampaign(id: string, data: z.infer<typeof adCampaignSchema>) {
  try {
    const parsed = adCampaignSchema.parse(data);
    await prisma.adCampaign.update({
      where: { id },
      data: {
        ...parsed,
        fromDate: new Date(parsed.fromDate),
        toDate: new Date(parsed.toDate),
      },
    });
    revalidatePath("/admin/expenses");
    return { success: true };
  } catch {
    return { success: false, message: "فشل تحديث الحملة" };
  }
}

export async function deleteAdCampaign(id: string) {
  try {
    await prisma.adCampaign.delete({ where: { id } });
    revalidatePath("/admin/expenses");
    return { success: true };
  } catch {
    return { success: false, message: "فشل حذف الحملة" };
  }
}

// ─── Proportional helpers (used by profit page) ──────────────────────────────

function overlapDays(
  aFrom: Date, aTo: Date,
  bFrom: Date, bTo: Date,
): number {
  const start = Math.max(aFrom.getTime(), bFrom.getTime());
  const end   = Math.min(aTo.getTime(),   bTo.getTime());
  if (start > end) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

function campaignDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
}

export async function getExpenseStatsForPeriod(from: Date, to: Date) {
  // Fetch campaigns and expenses that overlap with [from, to]
  const [campaigns, expenses] = await Promise.all([
    prisma.adCampaign.findMany({
      where: { fromDate: { lte: to }, toDate: { gte: from } },
      include: { product: { select: { id: true, name: true } } },
    }),
    prisma.expense.findMany({
      where: { fromDate: { lte: to }, toDate: { gte: from } },
    }),
  ]);

  // Per-product ad spend
  const adByProduct = new Map<string, { productId: string; name: string; amount: number }>();
  let totalAdCost = 0;
  for (const c of campaigns) {
    const total   = Number(c.amount);
    const days    = campaignDays(c.fromDate, c.toDate);
    const overlap = overlapDays(c.fromDate, c.toDate, from, to);
    const portion = days > 0 ? (total * overlap) / days : 0;
    totalAdCost += portion;

    const existing = adByProduct.get(c.productId);
    if (existing) {
      existing.amount += portion;
    } else {
      adByProduct.set(c.productId, {
        productId: c.productId,
        name: c.product.name,
        amount: portion,
      });
    }
  }

  // Per-category expenses
  const expenseByCategory = new Map<string, { category: string; amount: number }>();
  let totalExpenses = 0;
  for (const e of expenses) {
    const total   = Number(e.amount);
    const days    = campaignDays(e.fromDate, e.toDate);
    const overlap = overlapDays(e.fromDate, e.toDate, from, to);
    const portion = days > 0 ? (total * overlap) / days : 0;
    totalExpenses += portion;

    const existing = expenseByCategory.get(e.category);
    if (existing) {
      existing.amount += portion;
    } else {
      expenseByCategory.set(e.category, { category: e.category, amount: portion });
    }
  }

  return {
    adByProduct: Array.from(adByProduct.values()),
    totalAdCost,
    expenseByCategory: Array.from(expenseByCategory.values()),
    totalExpenses,
    totalOverheadCost: totalAdCost + totalExpenses,
  };
}
