"use server";
import { prisma } from "@/db/prisma";
import { requireAdministrator } from "@/lib/authorization";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { formatError } from "../utils";
import {
  computeImport,
  deriveFromHistory,
  importSignal,
  reorderAdvice,
  type HistoryDerived,
  type ImportInputs,
  type ImportResult,
  type ImportSignal,
  type ProductHistory,
} from "../import-calc";
import {
  COMMITTED_STATUSES,
  MANUAL_STATUSES,
  isImportStatus,
  type ImportStatus,
} from "../import-status";
import { REVENUE_STATUSES } from "../constants/order-statuses";
import { EXCLUDE_INTERNAL_PRODUCTS } from "../constants/internal-products";
import { getOrderProfitStats } from "./order.actions";
import { getExpenseStatsForPeriod } from "./expense.actions";
import { getCurrentFx, getLastSync } from "./adspend.actions";

const RETURN_STATUSES = ["returned", "returnReceived"];
/** طلبات خرجت بضاعتها ولم تُحسم بعد — تدخل في سرعة البيع لا في النسب. */
const IN_TRANSIT_STATUSES = ["pending"];

function revalidateImportPages(id?: string) {
  revalidatePath("/admin/imports");
  if (id) revalidatePath(`/admin/imports/${id}`);
}

// ─── الإعدادات ───────────────────────────────────────────────────────────────

export type ImportSettingsDTO = {
  alibabaFeePct: number;
  cardFeePct: number;
  cardFixedUsd: number;
  opsCostPerUnitKiqd: number;
  defaultDeliveryRatePct: number;
  defaultCpaUsd: number;
  targetMarginPct: number;
  historyWindowDays: number;
  minHistoryOrders: number;
  reorderCoverDays: number;
  leadTimeDays: number;
};

const settingsSchema = z.object({
  alibabaFeePct: z.coerce.number().min(0).max(100),
  cardFeePct: z.coerce.number().min(0).max(100),
  cardFixedUsd: z.coerce.number().min(0),
  opsCostPerUnitKiqd: z.coerce.number().min(0),
  defaultDeliveryRatePct: z.coerce.number().min(1).max(100),
  defaultCpaUsd: z.coerce.number().min(0),
  targetMarginPct: z.coerce.number().min(0).max(100),
  historyWindowDays: z.coerce.number().int().min(7).max(400),
  minHistoryOrders: z.coerce.number().int().min(1),
  reorderCoverDays: z.coerce.number().int().min(1).max(365),
  leadTimeDays: z.coerce.number().int().min(0).max(365),
});

async function loadSettings(): Promise<ImportSettingsDTO> {
  const s = await prisma.importSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  return {
    alibabaFeePct: Number(s.alibabaFeePct),
    cardFeePct: Number(s.cardFeePct),
    cardFixedUsd: Number(s.cardFixedUsd),
    opsCostPerUnitKiqd: Number(s.opsCostPerUnitKiqd),
    defaultDeliveryRatePct: Number(s.defaultDeliveryRatePct),
    defaultCpaUsd: Number(s.defaultCpaUsd),
    targetMarginPct: Number(s.targetMarginPct),
    historyWindowDays: s.historyWindowDays,
    minHistoryOrders: s.minHistoryOrders,
    reorderCoverDays: s.reorderCoverDays,
    leadTimeDays: s.leadTimeDays,
  };
}

export async function getImportSettings(): Promise<ImportSettingsDTO> {
  await requireAdministrator();
  return loadSettings();
}

export async function updateImportSettings(data: ImportSettingsDTO) {
  await requireAdministrator();
  try {
    const parsed = settingsSchema.parse(data);
    await prisma.importSettings.upsert({
      where: { id: "default" },
      update: parsed,
      create: { id: "default", ...parsed },
    });
    revalidateImportPages();
    return { success: true, message: "تم حفظ إعدادات الاستيراد" };
  } catch (error) {
    return { success: false, message: formatError(error).formError };
  }
}

// ─── المنتجات المرشحة ────────────────────────────────────────────────────────

const candidateSchema = z
  .object({
    name: z.string().trim().min(2, "اسم المنتج مطلوب"),
    kind: z.enum(["new", "reimport"]),
    productId: z.string().uuid().nullable().optional(),
    supplierName: z.string().trim().max(200).optional().nullable(),
    supplierUrl: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(5000).optional().nullable(),
    quantity: z.coerce.number().int().positive("الكمية يجب أن تكون أكبر من صفر"),
    moq: z.coerce.number().int().min(0).nullable().optional(),
    unitPriceUsd: z.coerce.number().min(0),
    intlShippingUsd: z.coerce.number().min(0),
    alibabaFeePct: z.coerce.number().min(0).max(100),
    cardFeePct: z.coerce.number().min(0).max(100),
    cardFixedUsd: z.coerce.number().min(0),
    fxRate: z.coerce.number().positive("سعر الصرف مطلوب"),
    customsKiqd: z.coerce.number().min(0),
    oneOffKiqd: z.coerce.number().min(0),
    opsCostPerUnitKiqd: z.coerce.number().min(0),
    sellingPriceKiqd: z.coerce.number().min(0),
    netDeliveryPerOrderKiqd: z.coerce.number(),
    unitsPerOrder: z.coerce.number().positive(),
    cpaUsd: z.coerce.number().min(0),
    deliveryRatePct: z.coerce.number().min(1, "نسبة التوصيل يجب أن تكون 1٪ على الأقل").max(100),
    leadTimeDays: z.coerce.number().int().min(0).nullable().optional(),
  })
  .refine((d) => d.kind === "new" || !!d.productId, {
    message: "اختر المنتج الذي تعيد استيراده",
    path: ["productId"],
  });

export type CandidateInput = z.input<typeof candidateSchema>;

export type CandidateSnapshot = {
  inputs: ImportInputs;
  result: ImportResult;
  signal: ImportSignal;
  targetMarginPct: number;
  at: string;
};

export type CandidateDTO = {
  id: string;
  name: string;
  kind: "new" | "reimport";
  status: ImportStatus;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  supplierName: string | null;
  supplierUrl: string | null;
  notes: string | null;
  moq: number | null;
  leadTimeDays: number | null;
  inputs: ImportInputs;
  result: ImportResult;
  signal: ImportSignal;
  snapshot: CandidateSnapshot | null;
  receivedQty: number | null;
  actualIntlShippingUsd: number | null;
  actualCustomsKiqd: number | null;
  actualFxRate: number | null;
  actualLandedKiqd: number | null;
  batchId: string | null;
  convertedAt: string | null;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
};

type CandidateRow = Prisma.ImportCandidateGetPayload<{
  include: { product: { select: { name: true; slug: true } } };
}>;

function rowInputs(r: CandidateRow): ImportInputs {
  return {
    quantity: r.quantity,
    unitPriceUsd: Number(r.unitPriceUsd),
    intlShippingUsd: Number(r.intlShippingUsd),
    alibabaFeePct: Number(r.alibabaFeePct),
    cardFeePct: Number(r.cardFeePct),
    cardFixedUsd: Number(r.cardFixedUsd),
    fxRate: Number(r.fxRate),
    customsKiqd: Number(r.customsKiqd),
    oneOffKiqd: Number(r.oneOffKiqd),
    opsCostPerUnitKiqd: Number(r.opsCostPerUnitKiqd),
    sellingPriceKiqd: Number(r.sellingPriceKiqd),
    netDeliveryPerOrderKiqd: Number(r.netDeliveryPerOrderKiqd),
    unitsPerOrder: Number(r.unitsPerOrder),
    cpaUsd: Number(r.cpaUsd),
    deliveryRatePct: Number(r.deliveryRatePct),
  };
}

const numOrNull = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

function toDTO(r: CandidateRow, targetMarginPct: number): CandidateDTO {
  const inputs = rowInputs(r);
  const result = computeImport(inputs);
  return {
    id: r.id,
    name: r.name,
    kind: r.kind === "reimport" ? "reimport" : "new",
    status: isImportStatus(r.status) ? r.status : "idea",
    productId: r.productId,
    productName: r.product?.name ?? null,
    productSlug: r.product?.slug ?? null,
    supplierName: r.supplierName,
    supplierUrl: r.supplierUrl,
    notes: r.notes,
    moq: r.moq,
    leadTimeDays: r.leadTimeDays,
    inputs,
    result,
    signal: importSignal(result, targetMarginPct),
    snapshot: (r.snapshot as CandidateSnapshot | null) ?? null,
    receivedQty: r.receivedQty,
    actualIntlShippingUsd: numOrNull(r.actualIntlShippingUsd),
    actualCustomsKiqd: numOrNull(r.actualCustomsKiqd),
    actualFxRate: numOrNull(r.actualFxRate),
    actualLandedKiqd: numOrNull(r.actualLandedKiqd),
    batchId: r.batchId,
    convertedAt: r.convertedAt?.toISOString() ?? null,
    statusChangedAt: r.statusChangedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const withProduct = { product: { select: { name: true, slug: true } } } as const;

function buildSnapshot(inputs: ImportInputs, targetMarginPct: number): CandidateSnapshot {
  const result = computeImport(inputs);
  return {
    inputs,
    result,
    signal: importSignal(result, targetMarginPct),
    targetMarginPct,
    at: new Date().toISOString(),
  };
}

export async function getImportCandidates(): Promise<CandidateDTO[]> {
  await requireAdministrator();
  const [settings, rows] = await Promise.all([
    loadSettings(),
    prisma.importCandidate.findMany({ include: withProduct, orderBy: { createdAt: "desc" } }),
  ]);
  return rows.map((r) => toDTO(r, settings.targetMarginPct));
}

export async function getImportCandidate(id: string): Promise<CandidateDTO | null> {
  await requireAdministrator();
  const [settings, row] = await Promise.all([
    loadSettings(),
    prisma.importCandidate.findUnique({ where: { id }, include: withProduct }),
  ]);
  return row ? toDTO(row, settings.targetMarginPct) : null;
}

function candidateData(p: z.output<typeof candidateSchema>) {
  return {
    name: p.name,
    kind: p.kind,
    productId: p.kind === "reimport" ? p.productId ?? null : p.productId ?? null,
    supplierName: p.supplierName || null,
    supplierUrl: p.supplierUrl || null,
    notes: p.notes || null,
    quantity: p.quantity,
    moq: p.moq || null,
    unitPriceUsd: p.unitPriceUsd,
    intlShippingUsd: p.intlShippingUsd,
    alibabaFeePct: p.alibabaFeePct,
    cardFeePct: p.cardFeePct,
    cardFixedUsd: p.cardFixedUsd,
    fxRate: p.fxRate,
    customsKiqd: p.customsKiqd,
    oneOffKiqd: p.oneOffKiqd,
    opsCostPerUnitKiqd: p.opsCostPerUnitKiqd,
    sellingPriceKiqd: p.sellingPriceKiqd,
    netDeliveryPerOrderKiqd: p.netDeliveryPerOrderKiqd,
    unitsPerOrder: p.unitsPerOrder,
    cpaUsd: p.cpaUsd,
    deliveryRatePct: p.deliveryRatePct,
    leadTimeDays: p.leadTimeDays ?? null,
  };
}

export async function createImportCandidate(data: CandidateInput) {
  await requireAdministrator();
  try {
    const parsed = candidateSchema.parse(data);
    const created = await prisma.importCandidate.create({ data: candidateData(parsed) });
    revalidateImportPages();
    return { success: true, message: "تمت إضافة المنتج المرشح", id: created.id };
  } catch (error) {
    return { success: false, message: formatError(error).formError, id: null };
  }
}

export async function updateImportCandidate(id: string, data: CandidateInput) {
  await requireAdministrator();
  try {
    const parsed = candidateSchema.parse(data);
    const existing = await prisma.importCandidate.findUniqueOrThrow({ where: { id } });
    if (existing.status === "converted") throw new Error("هذا المنتج أُضيف للمخزون — لا يمكن تعديل حساباته");
    await prisma.importCandidate.update({ where: { id }, data: candidateData(parsed) });
    revalidateImportPages(id);
    return { success: true, message: "تم حفظ التعديلات" };
  } catch (error) {
    return { success: false, message: formatError(error).formError };
  }
}

/**
 * تغيير المرحلة. عند الدخول في مرحلة ملتزمة (موافَق فما بعد) تُؤخذ لقطة ثابتة
 * إن لم توجد، وعند الرجوع إلى «فكرة/قيد الدراسة/مرفوض» تُمسح لتُؤخذ من جديد.
 */
export async function setImportCandidateStatus(id: string, status: string) {
  await requireAdministrator();
  try {
    if (!isImportStatus(status) || !MANUAL_STATUSES.includes(status)) throw new Error("مرحلة غير صالحة");
    const [settings, row] = await Promise.all([
      loadSettings(),
      prisma.importCandidate.findUniqueOrThrow({ where: { id }, include: withProduct }),
    ]);
    if (row.status === "converted") throw new Error("هذا المنتج أُضيف للمخزون — لا يمكن تغيير مرحلته");
    const committed = COMMITTED_STATUSES.includes(status);
    const snapshot = committed
      ? row.snapshot ?? buildSnapshot(rowInputs(row), settings.targetMarginPct)
      : null;
    await prisma.importCandidate.update({
      where: { id },
      data: {
        status,
        statusChangedAt: new Date(),
        snapshot: snapshot === null ? Prisma.DbNull : (snapshot as unknown as Prisma.InputJsonValue),
        snapshotAt: snapshot === null ? null : row.snapshotAt ?? new Date(),
      },
    });
    revalidateImportPages(id);
    return { success: true, message: "تم تحديث المرحلة" };
  } catch (error) {
    return { success: false, message: formatError(error).formError };
  }
}

/** يعيد أخذ اللقطة بالمدخلات الحالية (بعد تعديل عرض السعر مثلاً). */
export async function refreshImportSnapshot(id: string) {
  await requireAdministrator();
  try {
    const [settings, row] = await Promise.all([
      loadSettings(),
      prisma.importCandidate.findUniqueOrThrow({ where: { id }, include: withProduct }),
    ]);
    if (!isImportStatus(row.status) || !COMMITTED_STATUSES.includes(row.status)) {
      throw new Error("اللقطة تؤخذ فقط للمنتجات الموافَق عليها");
    }
    const snapshot = buildSnapshot(rowInputs(row), settings.targetMarginPct);
    await prisma.importCandidate.update({
      where: { id },
      data: { snapshot: snapshot as unknown as Prisma.InputJsonValue, snapshotAt: new Date() },
    });
    revalidateImportPages(id);
    return { success: true, message: "تم تحديث اللقطة" };
  } catch (error) {
    return { success: false, message: formatError(error).formError };
  }
}

export async function deleteImportCandidate(id: string) {
  await requireAdministrator();
  try {
    const row = await prisma.importCandidate.findUniqueOrThrow({ where: { id } });
    if (row.status === "converted") throw new Error("لا يمكن حذف منتج أُضيف للمخزون — دفعته مرتبطة به");
    await prisma.importCandidate.delete({ where: { id } });
    revalidateImportPages();
    return { success: true, message: "تم الحذف" };
  } catch (error) {
    return { success: false, message: formatError(error).formError };
  }
}

// ─── التاريخ الفعلي للمنتجات (إعادة الاستيراد والمقارنة) ──────────────────

/** يوم بغداد الحالي بصيغة منتصف النهار UTC — نفس ما ترسله صفحة الأرباح. */
function iraqDay(offsetDays = 0, base = new Date()) {
  const iraq = new Date(base.getTime() + 3 * 3600_000);
  const d = new Date(Date.UTC(iraq.getUTCFullYear(), iraq.getUTCMonth(), iraq.getUTCDate(), 12));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/** نفس تحويل getOrderProfitStats لحدود النافذة (منتصف ليل بغداد). */
function iraqBounds(from: Date, to: Date) {
  const day = (d: Date) => d.toISOString().split("T")[0].split("-").map(Number);
  const [fy, fm, fd] = day(from);
  const [ty, tm, td] = day(to);
  return {
    start: new Date(Date.UTC(fy, fm - 1, fd - 1, 21, 0, 0, 0)),
    end: new Date(Date.UTC(ty, tm - 1, td, 20, 59, 59, 999)),
  };
}

/**
 * أرقام الفترة من دوال صفحة الأرباح — ثقيلة (8 أشهر ≈ ثوانٍ عدة لأنها تعيد
 * حساب تكلفة الدفعات لكل المنتجات)، وكل المنتجات تخرج من نداء واحد. لذلك
 * تُحفظ مؤقتاً 5 دقائق لكل نافذة، فاختيار منتج آخر لا يعيد الحساب.
 */
const PERIOD_TTL_MS = 5 * 60_000;
type PeriodNumbers = [
  Awaited<ReturnType<typeof getOrderProfitStats>>,
  Awaited<ReturnType<typeof getExpenseStatsForPeriod>>,
];
const periodCache = new Map<string, { at: number; value: Promise<PeriodNumbers> }>();

function loadPeriod(from: Date, to: Date): Promise<PeriodNumbers> {
  const key = `${from.toISOString().slice(0, 10)}|${to.toISOString().slice(0, 10)}`;
  const hit = periodCache.get(key);
  if (hit && Date.now() - hit.at < PERIOD_TTL_MS) return hit.value;
  const value = Promise.all([getOrderProfitStats({ from, to }), getExpenseStatsForPeriod(from, to)]);
  periodCache.set(key, { at: Date.now(), value });
  // نداء فاشل لا يبقى في الذاكرة.
  value.catch(() => periodCache.delete(key));
  for (const [k, v] of periodCache) if (Date.now() - v.at >= PERIOD_TTL_MS) periodCache.delete(k);
  return value;
}

/** تحذير المزامنة نفسه الذي تعرضه صفحة الأرباح. */
function syncWarnings(lastSync: Awaited<ReturnType<typeof getLastSync>> | null): HistoryWarning[] {
  const warnings: HistoryWarning[] = [];
  if (!lastSync) return warnings;
  const stale = lastSync.date
    ? Math.floor((Date.now() - new Date(`${lastSync.date}T12:00:00.000Z`).getTime()) / 86400_000)
    : null;
  if (lastSync.ranAt === null) warnings.push({ kind: "sync", text: "لم تُشغَّل مزامنة الصرف الإعلاني بعد — تكلفة الإعلان الفعلية غير مكتملة." });
  else if (!lastSync.ok) warnings.push({ kind: "sync", text: `فشلت آخر مزامنة للصرف الإعلاني (${lastSync.date ?? ""}) — تكلفة الإعلان قد تكون ناقصة والربح أعلى من الحقيقة.` });
  else if (stale !== null && stale > 2) warnings.push({ kind: "sync", text: `آخر مزامنة للصرف الإعلاني قبل ${stale} يوماً — تكلفة الإعلان قد تكون ناقصة.` });
  return warnings;
}

export type HistoryWarning = { kind: "sync" | "fx" | "sample"; text: string };

export type ProductHistoryStats = {
  productId: string;
  name: string;
  history: ProductHistory;
  derived: HistoryDerived;
  /** قطع خرجت من المخزن (مسلَّمة + في الطريق) لكل يوم. */
  unitsPerDay: number;
  activeDays: number;
  stock: number;
  latestBatchCostKiqd: number | null;
  latestBatchAt: string | null;
  lowConfidence: boolean;
};

export type HistoryReport = {
  from: string;
  to: string;
  windowDays: number;
  warnings: HistoryWarning[];
  products: Record<string, ProductHistoryStats>;
};

/**
 * أرقام المنتجات الفعلية في نافذة زمنية. الإيراد والتكلفة من getOrderProfitStats
 * والإعلان من getExpenseStatsForPeriod — نفس دوال صفحة الأرباح بالضبط، فلا يظهر
 * رقمان مختلفان لنفس المنتج. نضيف فقط عدّ الطلبات الراجعة (طلبات لا قطع)
 * والقطع التي في الطريق لسرعة البيع.
 */
async function loadHistory(from: Date, to: Date, minOrders: number, productIds?: string[]): Promise<HistoryReport> {
  const { start, end } = iraqBounds(from, to);
  const [[profit, expenses], lastSync, items] = await Promise.all([
    loadPeriod(from, to),
    getLastSync().catch(() => null),
    prisma.orderItem.findMany({
      where: {
        ...(productIds ? { productId: { in: productIds } } : {}),
        order: {
          createdAt: { gte: start, lte: end },
          status: { in: [...REVENUE_STATUSES, ...RETURN_STATUSES, ...IN_TRANSIT_STATUSES] },
        },
      },
      select: { productId: true, orderId: true, qty: true, order: { select: { status: true, createdAt: true } } },
    }),
  ]);

  const ids = new Set<string>(productIds ?? []);
  if (!productIds) {
    for (const p of profit.productStats) ids.add(p.productId);
    for (const i of items) ids.add(i.productId);
  }

  const counts = new Map<string, { returnedOrders: Set<string>; transitUnits: number; firstAt: number }>();
  for (const i of items) {
    const c = counts.get(i.productId) ?? { returnedOrders: new Set<string>(), transitUnits: 0, firstAt: Infinity };
    if (RETURN_STATUSES.includes(i.order.status)) c.returnedOrders.add(i.orderId);
    if (IN_TRANSIT_STATUSES.includes(i.order.status)) c.transitUnits += i.qty;
    c.firstAt = Math.min(c.firstAt, i.order.createdAt.getTime());
    counts.set(i.productId, c);
  }

  const idList = [...ids];
  const [products, batches] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: idList } }, select: { id: true, name: true, stock: true } }),
    prisma.productBatch.findMany({
      where: { productId: { in: idList } },
      orderBy: { createdAt: "desc" },
      select: { productId: true, costPrice: true, createdAt: true },
    }),
  ]);
  const latestBatch = new Map<string, { cost: number; at: Date }>();
  for (const b of batches) if (!latestBatch.has(b.productId)) latestBatch.set(b.productId, { cost: Number(b.costPrice), at: b.createdAt });

  const statById = new Map(profit.productStats.map((p) => [p.productId, p]));
  const adById = new Map(expenses.adByProduct.map((a) => [a.productId, a.amount]));
  const windowDays = Math.round((to.getTime() - from.getTime()) / 86400_000) + 1;

  const out: Record<string, ProductHistoryStats> = {};
  for (const p of products) {
    const s = statById.get(p.id);
    const c = counts.get(p.id);
    const history: ProductHistory = {
      deliveredUnits: s?.totalQty ?? 0,
      deliveredOrders: s?.orderCount ?? 0,
      returnedOrders: c?.returnedOrders.size ?? 0,
      netRevenueKiqd: s?.totalRevenue ?? 0,
      cogsKiqd: s?.totalCost ?? 0,
      adSpendKiqd: adById.get(p.id) ?? 0,
    };
    const derived = deriveFromHistory(history);
    // أيام البيع الفعلية: من أول طلب في النافذة (منتج أحدث من النافذة لا تُظلم سرعته).
    const activeDays =
      c && Number.isFinite(c.firstAt)
        ? Math.min(windowDays, Math.max(1, Math.ceil((end.getTime() - c.firstAt) / 86400_000)))
        : windowDays;
    const lb = latestBatch.get(p.id);
    out[p.id] = {
      productId: p.id,
      name: p.name,
      history,
      derived,
      unitsPerDay: (history.deliveredUnits + (c?.transitUnits ?? 0)) / activeDays,
      activeDays,
      stock: p.stock,
      latestBatchCostKiqd: lb ? lb.cost : null,
      latestBatchAt: lb ? lb.at.toISOString() : null,
      lowConfidence: derived.resolvedOrders < minOrders,
    };
  }

  const warnings = syncWarnings(lastSync);
  if (expenses.droppedNoFxCount > 0) {
    warnings.push({ kind: "fx", text: `${expenses.droppedNoFxCount} إدخال إعلاني بالدولار بلا سعر صرف يغطيه — مستبعد من الحساب.` });
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    windowDays,
    warnings,
    products: out,
  };
}

export type ReimportHistory = {
  report: HistoryReport;
  stats: ProductHistoryStats | null;
  reorder: ReturnType<typeof reorderAdvice> | null;
  minHistoryOrders: number;
};

/** تاريخ منتج واحد في نافذة الإعدادات (240 يوماً افتراضياً) مع نصيحة إعادة الطلب. */
export async function getReimportHistory(productId: string, windowDays?: number): Promise<ReimportHistory> {
  await requireAdministrator();
  const settings = await loadSettings();
  const days = Math.min(400, Math.max(7, Math.floor(windowDays ?? settings.historyWindowDays)));
  const to = iraqDay();
  const from = iraqDay(-(days - 1));
  const report = await loadHistory(from, to, settings.minHistoryOrders, [productId]);
  const stats = report.products[productId] ?? null;
  const reorder = stats
    ? reorderAdvice({
        stock: stats.stock,
        unitsPerDay: stats.unitsPerDay,
        leadTimeDays: settings.leadTimeDays,
        coverDays: settings.reorderCoverDays,
      })
    : null;
  return { report, stats, reorder, minHistoryOrders: settings.minHistoryOrders };
}

export type ReorderAlert = {
  productId: string;
  name: string;
  stock: number;
  unitsPerDay: number;
  daysToStockout: number | null;
  daysUntilOrder: number | null;
  suggestedQty: number;
  orderNow: boolean;
  hasOpenCandidate: boolean;
};

/**
 * سرعة خروج القطع من المخزن لكل منتج — نفس تعريف loadHistory (مسلَّم + في
 * الطريق ÷ أيام البيع الفعلية) لكن باستعلام خفيف واحد بدل حساب الأرباح كاملاً.
 */
async function loadVelocity(from: Date, to: Date) {
  const { end, start } = iraqBounds(from, to);
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: start, lte: end },
        status: { in: [...REVENUE_STATUSES, ...RETURN_STATUSES, ...IN_TRANSIT_STATUSES] },
      },
    },
    select: { productId: true, qty: true, order: { select: { status: true, createdAt: true } } },
  });
  const windowDays = Math.round((to.getTime() - from.getTime()) / 86400_000) + 1;
  const acc = new Map<string, { units: number; firstAt: number }>();
  for (const i of items) {
    const a = acc.get(i.productId) ?? { units: 0, firstAt: Infinity };
    if (!RETURN_STATUSES.includes(i.order.status)) a.units += i.qty;
    a.firstAt = Math.min(a.firstAt, i.order.createdAt.getTime());
    acc.set(i.productId, a);
  }
  const out = new Map<string, number>();
  for (const [id, a] of acc) {
    const days = Math.min(windowDays, Math.max(1, Math.ceil((end.getTime() - a.firstAt) / 86400_000)));
    out.set(id, a.units / days);
  }
  return { perDay: out, windowDays };
}

/** منتجات تقترب من النفاد قبل أن تصل شحنة جديدة — للوحة القيادة. */
export async function getReorderAlerts(): Promise<{ alerts: ReorderAlert[]; warnings: HistoryWarning[]; windowDays: number }> {
  await requireAdministrator();
  const settings = await loadSettings();
  const to = iraqDay();
  const from = iraqDay(-(settings.historyWindowDays - 1));
  const [velocity, lastSync, open] = await Promise.all([
    loadVelocity(from, to),
    getLastSync().catch(() => null),
    prisma.importCandidate.findMany({
      where: { productId: { not: null }, status: { notIn: ["converted", "rejected"] } },
      select: { productId: true },
    }),
  ]);
  const products = await prisma.product.findMany({
    where: { ...EXCLUDE_INTERNAL_PRODUCTS, id: { in: [...velocity.perDay.keys()] } },
    select: { id: true, name: true, stock: true },
  });
  const openIds = new Set(open.map((o) => o.productId));
  // الإنذار المبكر: من سينفد خلال مدة الشحن + أسبوعين.
  const horizon = settings.leadTimeDays + 14;
  const alerts: ReorderAlert[] = [];
  for (const p of products) {
    const unitsPerDay = velocity.perDay.get(p.id) ?? 0;
    if (unitsPerDay <= 0) continue;
    const r = reorderAdvice({
      stock: p.stock,
      unitsPerDay,
      leadTimeDays: settings.leadTimeDays,
      coverDays: settings.reorderCoverDays,
    });
    if (r.daysToStockout === null || r.daysToStockout > horizon) continue;
    alerts.push({
      productId: p.id,
      name: p.name,
      stock: p.stock,
      unitsPerDay,
      daysToStockout: r.daysToStockout,
      daysUntilOrder: r.daysUntilOrder,
      suggestedQty: r.suggestedQty,
      orderNow: r.orderNow,
      hasOpenCandidate: openIds.has(p.id),
    });
  }
  alerts.sort((a, b) => (a.daysToStockout ?? 0) - (b.daysToStockout ?? 0));
  return { alerts, warnings: syncWarnings(lastSync), windowDays: velocity.windowDays };
}

/** سعر الصرف الساري — يُعبّأ افتراضياً في كل منتج جديد. */
export async function getImportFxDefault(): Promise<number | null> {
  await requireAdministrator();
  const fx = await getCurrentFx().catch(() => ({ rate: null }));
  return fx.rate;
}

export async function getProductsForImport(): Promise<{ id: string; name: string; price: number; stock: number }[]> {
  await requireAdministrator();
  const rows = await prisma.product.findMany({
    where: EXCLUDE_INTERNAL_PRODUCTS,
    select: { id: true, name: true, price: true, stock: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, price: Number(r.price), stock: r.stock }));
}

// ─── الوصول: إضافة الشحنة إلى المخزون ──────────────────────────────────────

const arrivalSchema = z.object({
  productId: z.string().uuid("اختر المنتج في المتجر"),
  receivedQty: z.coerce.number().int().positive("الكمية المستلمة يجب أن تكون أكبر من صفر"),
  actualIntlShippingUsd: z.coerce.number().min(0),
  actualCustomsKiqd: z.coerce.number().min(0),
  actualFxRate: z.coerce.number().positive(),
});

export type ArrivalInput = z.input<typeof arrivalSchema>;

/**
 * التكلفة الواصلة الفعلية: البضاعة تُدفع على الكمية المطلوبة، لكن الشحنة كلها
 * تُوزَّع على القطع المستلمة فعلاً (التالف أو الناقص يرفع تكلفة السليم).
 */
function actualLanded(inputs: ImportInputs, a: z.output<typeof arrivalSchema>) {
  const r = computeImport({
    ...inputs,
    intlShippingUsd: a.actualIntlShippingUsd,
    customsKiqd: a.actualCustomsKiqd,
    fxRate: a.actualFxRate,
  });
  return r.shipmentKiqd / a.receivedQty + inputs.opsCostPerUnitKiqd;
}

export async function convertImportCandidate(id: string, data: ArrivalInput) {
  await requireAdministrator();
  try {
    const a = arrivalSchema.parse(data);
    const row = await prisma.importCandidate.findUniqueOrThrow({ where: { id }, include: withProduct });
    if (row.status !== "arrived") throw new Error("غيّر المرحلة إلى «وصل» أولاً");
    if (row.kind === "reimport" && row.productId && row.productId !== a.productId) {
      throw new Error("إعادة الاستيراد تُضاف لنفس المنتج المرتبط");
    }
    const landed = actualLanded(rowInputs(row), a);
    // الدفعات تُخزَّن بخانتين عشريتين (دقة 10 د.ع).
    const batchCost = Math.round(landed * 100) / 100;

    await prisma.$transaction(async (tx) => {
      // حارس ضد النقر المزدوج: التحويل يتم مرة واحدة فقط.
      const claimed = await tx.importCandidate.updateMany({
        where: { id, status: "arrived", batchId: null },
        data: { status: "converted" },
      });
      if (claimed.count === 0) throw new Error("تم تحويل هذا المنتج مسبقاً");

      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${a.productId}::uuid FOR UPDATE`;
      const existing = await tx.productBatch.findMany({ where: { productId: a.productId }, select: { batchNumber: true } });
      const next =
        existing.reduce((max, b) => {
          const n = parseInt(b.batchNumber ?? "", 10);
          return Number.isFinite(n) && n > max ? n : max;
        }, 0) + 1;
      const batch = await tx.productBatch.create({
        data: {
          productId: a.productId,
          batchNumber: String(next),
          quantity: a.receivedQty,
          costPrice: batchCost,
          notes: `استيراد: ${row.name}${row.supplierName ? ` — ${row.supplierName}` : ""}`,
        },
      });
      await tx.product.update({ where: { id: a.productId }, data: { stock: { increment: a.receivedQty } } });
      await tx.importCandidate.update({
        where: { id },
        data: {
          productId: a.productId,
          batchId: batch.id,
          receivedQty: a.receivedQty,
          actualIntlShippingUsd: a.actualIntlShippingUsd,
          actualCustomsKiqd: a.actualCustomsKiqd,
          actualFxRate: a.actualFxRate,
          actualLandedKiqd: landed,
          convertedAt: new Date(),
          statusChangedAt: new Date(),
        },
      });
    });

    // دفعة جديدة تغيّر تكلفة البضاعة المحسوبة — لا تُعرض أرقام قديمة من الذاكرة.
    periodCache.clear();
    revalidateImportPages(id);
    revalidatePath("/admin/batches");
    revalidatePath("/admin/products");
    revalidatePath("/admin/profit");
    return { success: true, message: "أُضيفت الشحنة إلى المخزون كدفعة جديدة" };
  } catch (error) {
    return { success: false, message: formatError(error).formError };
  }
}

// ─── المتوقع مقابل الفعلي ───────────────────────────────────────────────────

export type ComparisonRow = { key: string; label: string; expected: number | null; actual: number | null; unit: "kiqd" | "pct" | "num" };

export type ImportComparison = {
  since: string;
  days: number;
  batchQty: number;
  batchRemaining: number | null;
  soldFromBatch: number | null;
  rows: ComparisonRow[];
  lowConfidence: boolean;
  warnings: HistoryWarning[];
};

/** يقارن لقطة الموافقة بما حدث فعلاً منذ وصول الشحنة. */
export async function getImportComparison(id: string): Promise<ImportComparison | null> {
  await requireAdministrator();
  const [settings, row] = await Promise.all([
    loadSettings(),
    prisma.importCandidate.findUnique({ where: { id }, include: withProduct }),
  ]);
  if (!row || row.status !== "converted" || !row.productId || !row.convertedAt) return null;

  const from = iraqDay(0, row.convertedAt);
  const to = iraqDay();
  const report = await loadHistory(from, to, settings.minHistoryOrders, [row.productId]);
  const s = report.products[row.productId];
  const d = s?.derived;

  const snap = (row.snapshot as CandidateSnapshot | null) ?? buildSnapshot(rowInputs(row), settings.targetMarginPct);
  const e = snap.result;
  const ei = snap.inputs;
  const landed = numOrNull(row.actualLandedKiqd);
  const has = !!d && d.resolvedOrders > 0;
  const actualProfit = has && landed !== null ? d.sellingPriceKiqd - landed - d.adPerDeliveredUnitKiqd : null;

  const batch = row.batchId
    ? await prisma.productBatch.findUnique({
        where: { id: row.batchId },
        select: { quantity: true, allocations: { select: { quantity: true, returnedAt: true } } },
      })
    : null;
  const soldFromBatch = batch
    ? batch.allocations.filter((x) => !x.returnedAt).reduce((sum, x) => sum + x.quantity, 0)
    : null;

  return {
    since: report.from,
    days: report.windowDays,
    batchQty: row.receivedQty ?? 0,
    soldFromBatch,
    batchRemaining: batch && soldFromBatch !== null ? batch.quantity - soldFromBatch : null,
    lowConfidence: !has || (s?.lowConfidence ?? true),
    warnings: report.warnings,
    rows: [
      { key: "landed", label: "التكلفة الواصلة للقطعة", expected: e.landedPerUnitKiqd, actual: landed, unit: "kiqd" },
      { key: "price", label: "صافي سعر البيع للقطعة", expected: ei.sellingPriceKiqd - e.deliveryPerUnitKiqd, actual: has ? d.sellingPriceKiqd : null, unit: "kiqd" },
      { key: "delivery", label: "نسبة نجاح التوصيل", expected: ei.deliveryRatePct, actual: has ? d.deliveryRatePct : null, unit: "pct" },
      { key: "ad", label: "الإعلان لكل قطعة مسلَّمة", expected: e.adPerUnitKiqd, actual: has ? d.adPerDeliveredUnitKiqd : null, unit: "kiqd" },
      { key: "profit", label: "صافي ربح القطعة", expected: e.profitPerUnitKiqd, actual: actualProfit, unit: "kiqd" },
      {
        key: "margin",
        label: "هامش الربح",
        expected: e.marginPct,
        actual: actualProfit !== null && has && d.sellingPriceKiqd > 0 ? (actualProfit / d.sellingPriceKiqd) * 100 : null,
        unit: "pct",
      },
      { key: "units", label: "قطع مسلَّمة منذ الوصول", expected: null, actual: s?.history.deliveredUnits ?? 0, unit: "num" },
    ],
  };
}
