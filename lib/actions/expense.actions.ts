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

/** منتصف يوم UTC لتاريخ معطى — نفس دلالة النسخة في adspend.actions. */
function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

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
  const [campaignsRaw, expenses] = await Promise.all([
    prisma.adCampaign.findMany({
      where: { fromDate: { lte: to }, toDate: { gte: from } },
      include: { product: { select: { id: true, name: true } } },
    }),
    prisma.expense.findMany({
      where: { fromDate: { lte: to }, toDate: { gte: from } },
    }),
  ]);

  // ── الصرف المستورد من Meta (الأرقام الفعلية اليومية) ──
  // الصفوف تُخزَّن بالدينار الكامل (amountIQD)، بينما بقية هذه الدالة تعمل
  // بوحدة «الألف د.ع» (نظام تخزين الأسعار المختصر الذي تعرضه formatCurrency
  // بعد ضربه ×1000). لذلك نقسم على 1000 هنا ليخرج كل شيء بوحدة واحدة،
  // فلا تتضاعف المصاريف المستوردة في صفحة الأرباح.
  const importedRows = await prisma.adSpendDaily.findMany({
    where: { date: { gte: from, lte: to } },
    select: { productId: true, amountIQD: true, amount: true },
  });
  const importedIQDByProduct = new Map<string, number>();
  let importedTotalIQD = 0;
  for (const r of importedRows) {
    const iqd = Number(r.amountIQD) / 1000;
    importedTotalIQD += iqd;
    importedIQDByProduct.set(
      r.productId,
      (importedIQDByProduct.get(r.productId) ?? 0) + iqd,
    );
  }

  // ── قاعدة الاستبدال: اليدوي المتقاطع مع نفس المنتج له صفوف Meta داخل مداه
  //    يُستبعد من الحساب ويُوسم (بلا حذف) — Meta هو المرجع.
  const importedDaysByProduct = new Map<string, Set<string>>();
  // يقتصر على مدى تواريخ الإدخالات اليدوية نفسها — كان يجلب الجدول كاملاً بلا
  // شرط، فينمو مع كل يوم مزامنة ويُنفَّذ عند كل فتح لصفحة الأرباح.
  const spanFrom = campaignsRaw.reduce<Date | null>(
    (min, c) => (min === null || c.fromDate < min ? c.fromDate : min),
    null,
  );
  const spanTo = campaignsRaw.reduce<Date | null>(
    (max, c) => (max === null || c.toDate > max ? c.toDate : max),
    null,
  );
  const allImported =
    spanFrom && spanTo
      ? await prisma.adSpendDaily.findMany({
          where: { date: { gte: spanFrom, lte: spanTo } },
          select: { productId: true, date: true },
        })
      : [];
  for (const r of allImported) {
    let s = importedDaysByProduct.get(r.productId);
    if (!s) {
      s = new Set<string>();
      importedDaysByProduct.set(r.productId, s);
    }
    s.add(r.date.toISOString().slice(0, 10));
  }
  const campaigns = campaignsRaw.map((c) => {
    const days = importedDaysByProduct.get(c.productId);
    if (!days || days.size === 0) return { ...c, _replaced: false as const, _partial: false as const };
    // هل أي يوم ضمن [fromDate, toDate] له صف مستورد؟ (نفحص التقاطع مع مدى الإدخال
    // وليس مع نافذة التقرير — الوسم خاصية للإدخال نفسه)
    let hit = false;
    const cur = new Date(c.fromDate.getTime());
    const end = c.toDate;
    while (cur <= end) {
      if (days.has(cur.toISOString().slice(0, 10))) {
        hit = true;
        break;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (!hit) return { ...c, _replaced: false as const, _partial: false as const };
    // جزئي = بعض أيام مداه بلا تغطية Meta (فجوة جلب أو قبل بدء المزامنة)
    let covered = 0;
    let total = 0;
    const cur2 = new Date(c.fromDate.getTime());
    while (cur2 <= end) {
      total += 1;
      if (days.has(cur2.toISOString().slice(0, 10))) covered += 1;
      cur2.setUTCDate(cur2.getUTCDate() + 1);
    }
    return {
      ...c,
      _replaced: true as const,
      _partial: covered < total,
    };
  });

  // Per-product ad spend — اليدوي غير المستبدل + المستورد الفعلي
  // إدخال يدوي بعملة USD: لا يبقى بالألف د.ع (نظام الأسعار) بل يُحوَّل
  // بسعر صرف يوم بداية الإدخال إلى الدينار ثم يُقسم على 1000 ليطابق الوحدة.
  const usdRows = campaignsRaw.filter((c) => c.currency === "USD");
  const usdToKiqd = new Map<string, number>(); // id → معامل التحويل
  if (usdRows.length > 0) {
    const fxRows = await prisma.fxRate.findMany({ orderBy: { fromDate: "desc" } });
    for (const c of usdRows) {
      const day = dayStart(c.fromDate);
      const fx = fxRows.find(
        (f) =>
          f.fromDate <= day && (f.toDate === null || f.toDate > day),
      );
      if (fx) usdToKiqd.set(c.id, Number(fx.rate) / 1000); // د.ع → ألف د.ع
    }
  }
  const adByProduct = new Map<string, { productId: string; name: string; amount: number }>();
  let totalAdCost = 0;
  let replacedManualTotal = 0;
  // إدخالات دولارية بلا سعر صرف يغطّي تاريخ بدايتها — تُستبعد من الحساب. كانت
  // تسقط بصمت؛ نجمعها الآن ونبلّغ عنها بدل أن يختفي المبلغ من التقرير.
  let droppedNoFxTotal = 0;
  let droppedNoFxCount = 0;
  for (const c of campaigns) {
    let total   = Number(c.amount);
    const usdFactor = usdToKiqd.get(c.id);
    if (c.currency === "USD") {
      if (usdFactor == null) {
        // لا سعر صرف يغطي بداية الإدخال — يُستبعد من الحساب ويُبلَّغ عنه.
        const days = campaignDays(c.fromDate, c.toDate);
        const overlap = overlapDays(c.fromDate, c.toDate, from, to);
        droppedNoFxTotal += days > 0 ? (total * overlap) / days : 0;
        droppedNoFxCount += 1;
        continue;
      }
      total = total * usdFactor; // دولار → ألف د.ع
    }
    const days    = campaignDays(c.fromDate, c.toDate);
    const overlap = overlapDays(c.fromDate, c.toDate, from, to);
    const portion = days > 0 ? (total * overlap) / days : 0;
    if (c._replaced) {
      // مُستبدَل تلقائياً من Meta — خارج الحساب (يبقى السجل ظاهراً مشطوباً).
      // portion هنا بوحدة الألف د.ع (نفس وحدة الإدخال اليدوي).
      replacedManualTotal += portion;
      continue;
    }

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

  // أسماء منتجات الصرف المستورد — تُقرأ من جدول المنتجات مباشرةً. كان الاسم
  // يُلتمس من الإدخالات اليدوية ويسقط إلى «منتج» عند غيابها (وهي الحالة الغالبة
  // الآن: لا إدخالات يدوية أصلاً).
  const importedNames = new Map<string, string>();
  if (importedIQDByProduct.size > 0) {
    const prods = await prisma.product.findMany({
      where: { id: { in: [...importedIQDByProduct.keys()] } },
      select: { id: true, name: true },
    });
    for (const pr of prods) importedNames.set(pr.id, pr.name);
  }

  // المستورد من Meta — يُدمج مع اليدوي (لن يتكرر: اليدوي المتقاطع استُبعد أعلاه).
  // القيم أصلاً حُوّلت إلى وحدة الألف د.ع أعلاه.
  for (const [productId, iqd] of importedIQDByProduct) {
    const camp = campaignsRaw.find((x) => x.productId === productId);
    const name = importedNames.get(productId) ?? camp?.product.name ?? "منتج";
    totalAdCost += iqd;
    const existing = adByProduct.get(productId);
    if (existing) {
      existing.amount += iqd;
    } else {
      adByProduct.set(productId, { productId, name, amount: iqd });
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
    // شفافية التكامل (بوحدة الألف د.ع مثل بقية الحقول):
    importedAdTotalIQD: importedTotalIQD,
    replacedManualTotal,
    // إدخالات دولارية مستبعدة لغياب سعر الصرف (بالدولار كما أُدخلت).
    droppedNoFxTotal,
    droppedNoFxCount,
    // لشارة مصدر الصرف في لوحة الأرباح.
    importedProductIds: [...new Set(importedRows.map((r) => r.productId))],
  };
}
