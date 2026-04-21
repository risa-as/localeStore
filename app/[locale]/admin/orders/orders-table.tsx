"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime, formatId, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition, useEffect, useCallback, memo } from "react";
import {
  bulkUpdateOrderStatus,
  deleteOrder,
  resendOrderToModon,
} from "@/lib/actions/order.actions";
import DeleteDialog from "@/components/shared/delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import dynamic from "next/dynamic";
const UpdateOrderForm = dynamic(() => import("./update-order-form"), {
  loading: () => (
    <div className="space-y-3 py-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-muted" />
      ))}
    </div>
  ),
  ssr: false,
});
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Loader2,
  Pencil,
  Eye,
  MessageCircle,
  ChevronUp,
  Package,
  Send,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

// Memoized row — only re-renders when its own data changes, not when dialog state changes
const MODON_STATUSES = new Set([
  "pending",
  "completed",
  "returned",
  "returnReceived",
  "rescheduled",
]);

const OrderRow = memo(function OrderRow({
  order,
  index,
  isSelected,
  onToggle,
  onEdit,
  onResend,
  t,
  tGov,
  showBarcode,
  showCollectedPrice,
}: {
  order: any;
  index: number;
  isSelected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onEdit: (order: any) => void;
  onResend: (id: string) => void;
  t: any;
  tGov: any;
  showBarcode: boolean;
  showCollectedPrice: boolean;
}) {
  return (
    <TableRow key={order.id} data-state={isSelected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggle(order.id, checked as boolean)}
          aria-label={`Select order ${order.id}`}
          className="mx-2"
        />
      </TableCell>
      <TableCell>{index + 1}</TableCell>
      <TableCell>{formatDateTime(order.createdAt).dateTime}</TableCell>
      <TableCell>{order.fullName}</TableCell>
      <TableCell>
        {order.orderitems && order.orderitems.length > 0
          ? order.orderitems
              .map((item: any) => `${item.name} ×${item.qty ?? 1}`)
              .join("، ")
          : t("noItems")}
      </TableCell>
      <TableCell>
        <a
          href={`https://wa.me/964${order.phoneNumber?.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
          title={t("whatsapp")}
        >
          <MessageCircle className="w-5 h-5 fill-current" />
        </a>
      </TableCell>
      <TableCell>{order.phoneNumber}</TableCell>
      <TableCell>
        {tGov.has(order.governorate as any)
          ? tGov(order.governorate as any)
          : order.governorate}
      </TableCell>
      <TableCell>{order.address}</TableCell>
      <TableCell>{order.quantity}</TableCell>
      <TableCell>{formatCurrency(order.totalPrice)}</TableCell>
      <TableCell>{formatCurrency(order.actualShippingCost ?? 0)}</TableCell>
      <TableCell className="max-w-[200px] truncate" title={order.notes || ""}>
        {order.notes || "-"}
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            order.status === "completed"
              ? "bg-green-100 text-green-800"
              : order.status === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : order.status === "returned" || order.status === "banned"
                  ? "bg-red-100 text-red-800"
                  : order.status === "rescheduled"
                    ? "bg-indigo-100 text-indigo-800"
                    : order.status === "failed"
                      ? "bg-red-200 text-red-900"
                      : order.status === "returnReceived"
                        ? "bg-teal-100 text-teal-800"
                        : "bg-gray-100 text-gray-800"
          }`}
        >
          {(order.status === "rescheduled" || order.status === "failed") && (
            <span className="text-[10px] font-bold opacity-70">🚚</span>
          )}
          {order.status === "returnReceived" && (
            <span className="text-[10px]">📦</span>
          )}
          {t(`Orders.Status.${order.status}`) || order.status}
        </span>
      </TableCell>
      {showBarcode && (
        <TableCell className="font-mono text-xs text-muted-foreground">
          {order.modonQrId ?? "-"}
        </TableCell>
      )}
      {showCollectedPrice &&
        (() => {
          const collected =
            order.modonCollectedPrice != null
              ? Number(order.modonCollectedPrice)
              : null;
          const total = Number(order.totalPrice);
          const hasDiff = collected != null && collected !== total;
          return (
            <TableCell
              className={hasDiff ? "bg-red-50 dark:bg-red-950/30" : ""}
            >
              {collected != null ? (
                <div className="flex flex-col gap-0.5">
                  <span
                    className={
                      hasDiff
                        ? "text-red-600 font-semibold"
                        : "text-green-700 font-medium"
                    }
                  >
                    {formatCurrency(collected)}
                  </span>
                  {hasDiff && (
                    <span className="text-xs text-red-500">
                      ({collected > total ? "+" : ""}
                      {formatCurrency(collected - total)})
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
          );
        })()}
      <TableCell>
        <div className="flex items-center gap-1">
          {order.status === "pending" && !order.modonQrId && (
            <Button
              variant="outline"
              size="icon"
              title="إعادة إرسال لمدن (فشل مسبقاً)"
              className="text-orange-500 border-orange-500 hover:bg-orange-50 hover:text-orange-600"
              onClick={() => onResend(order.id)}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            title={t("edit")}
            onClick={() => onEdit(order)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button asChild variant="ghost" size="icon" title={t("details")}>
            <Link href={`/order/${order.id}`}>
              <span className="sr-only">{t("details")}</span>
              <Eye className="w-4 h-4" />
            </Link>
          </Button>
          <DeleteDialog id={order.id} action={deleteOrder} />
        </div>
      </TableCell>
    </TableRow>
  );
});

export default function OrdersTable({
  orders,
  page,
  count,
  sort,
  status,
}: {
  orders: any[];
  page: number;
  count: number;
  sort?: string;
  status?: string;
}) {
  const t = useTranslations("Admin");
  const showBarcode = MODON_STATUSES.has(status ?? "");
  const showCollectedPrice =
    status === "completed" || status === "completedAccountant";

  // ... existing hooks ...
  const tGov = useTranslations("Governorates");
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  const createSortUrl = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sort") === key) {
      params.delete("sort");
    } else {
      params.set("sort", key);
    }
    return `?${params.toString()}`;
  };

  const [isPending, startTransition] = useTransition();
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // Preload the edit form chunk immediately so it's ready before user clicks
  useEffect(() => {
    import("./update-order-form");
  }, []);

  // Aggregate per-product breakdown: { name -> { total, orderCount, breakdown: { qty -> orderCount } } }
  const productSummary = orders.reduce<
    Record<
      string,
      { total: number; orderCount: number; breakdown: Record<number, number> }
    >
  >((acc, order) => {
    if (order.orderitems) {
      for (const item of order.orderitems) {
        const qty: number = item.qty ?? 1;
        if (!acc[item.name]) {
          acc[item.name] = { total: 0, orderCount: 0, breakdown: {} };
        }
        acc[item.name].total += qty;
        acc[item.name].orderCount += 1;
        acc[item.name].breakdown[qty] =
          (acc[item.name].breakdown[qty] ?? 0) + 1;
      }
    }
    return acc;
  }, {});
  const summaryEntries = Object.entries(productSummary).sort(
    (a, b) => b[1].total - a[1].total,
  );

  // Toggle all
  const toggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedOrders(orders.map((o) => o.id));
      } else {
        setSelectedOrders([]);
      }
    },
    [orders],
  );

  // Toggle single
  const toggleOrder = useCallback((id: string, checked: boolean) => {
    if (checked) {
      setSelectedOrders((prev) => [...prev, id]);
    } else {
      setSelectedOrders((prev) => prev.filter((o) => o !== id));
    }
  }, []);

  // Open edit dialog
  const handleEdit = useCallback((order: any) => {
    setEditingOrder(order);
    setOpenEdit(true);
  }, []);

  const handleResend = useCallback(
    (id: string) => {
      startTransition(async () => {
        const res = await resendOrderToModon(id);
        if (res.success) {
          toast({ title: "نجاح", description: res.message });
        } else {
          toast({
            variant: "destructive",
            title: "خطأ",
            description: res.message,
          });
        }
      });
    },
    [toast],
  );

  const isAllSelected =
    orders.length > 0 && selectedOrders.length === orders.length;

  const [confirmPendingOpen, setConfirmPendingOpen] = useState(false);

  const executeBulkUpdate = (status: string) => {
    startTransition(async () => {
      const res = await bulkUpdateOrderStatus(selectedOrders, status);
      if (res.success) {
        toast({ title: "Success", description: res.message });
        setSelectedOrders([]);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: res.message,
        });
      }
    });
  };

  const handleBulkUpdate = (status: string) => {
    if (status === "pending") {
      setConfirmPendingOpen(true);
      return;
    }
    executeBulkUpdate(status);
  };

  const statuses = [
    "home",
    "pending",
    "completed",
    "completedAccountant",
    "returned",
    "returnReceived",
    "rescheduled",
    "failed",
    "waiting",
    "unavailable",
    "delete",
    "banned",
  ];

  return (
    <div className="space-y-4">
      {/* Single Edit Dialog — rendered once, not per-row */}
      <Dialog
        open={openEdit}
        onOpenChange={(open) => {
          setOpenEdit(open);
          if (!open) setEditingOrder(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("edit")}</DialogTitle>
          </DialogHeader>
          {editingOrder && (
            <UpdateOrderForm order={editingOrder} setOpen={setOpenEdit} />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Pending Dialog */}
      <Dialog open={confirmPendingOpen} onOpenChange={setConfirmPendingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد التحويل إلى معلق</DialogTitle>
            <DialogDescription>
              {selectedOrders.length === 1
                ? "سيتم إرسال هذا الطلب إلى شركة مدن. هل أنت متأكد؟"
                : `سيتم إرسال ${selectedOrders.length} طلبات إلى شركة مدن. هل أنت متأكد؟`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmPendingOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => {
                setConfirmPendingOpen(false);
                executeBulkUpdate("pending");
              }}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "تأكيد"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Bar - kept same */}
      {selectedOrders.length > 0 && (
        <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md">
          <span className="text-sm font-medium">
            {selectedOrders.length} {t("Orders.selected")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t("Orders.moveTo")
                )}{" "}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {statuses.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => handleBulkUpdate(status)}
                >
                  {t(`Orders.Status.${status}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Product Summary Bar */}
      {summaryEntries.length > 0 && (
        <div className="rounded-lg border bg-muted/30 overflow-hidden">
          <button
            onClick={() => setSummaryExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Package className="w-4 h-4 text-primary" />
              <span>ملخص المنتجات</span>
              <span className="text-muted-foreground font-normal">
                ({summaryEntries.length} منتج،{" "}
                {summaryEntries.reduce((s, [, { total }]) => s + total, 0)}{" "}
                قطعة)
              </span>
            </div>
            {summaryExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {summaryExpanded && (
            <div className="px-4 pb-4 pt-2 border-t bg-background/50 flex flex-wrap gap-3">
              {summaryEntries.map(
                ([name, { total, orderCount, breakdown }]) => {
                  const tiers = Object.entries(breakdown)
                    .map(([q, c]) => ({ qty: Number(q), count: c }))
                    .sort((a, b) => a.qty - b.qty);
                  const tierColors = [
                    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                    "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
                    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
                  ];
                  return (
                    <div
                      key={name}
                      className="flex flex-col gap-1.5 rounded-xl border bg-background px-4 py-3 shadow-sm min-w-[180px]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold leading-tight">
                          {name}
                        </span>
                        <span className="flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold min-w-[24px] h-6 px-2">
                          {total}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {tiers.map(({ qty, count }, i) => (
                          <span
                            key={qty}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${tierColors[Math.min(i, tierColors.length - 1)]}`}
                          >
                            <span>×{qty}</span>
                            <span className="opacity-60">—</span>
                            <span>{count} طلب</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      )}

      {/* Modon Collected Price Statistics */}
      {showCollectedPrice &&
        (() => {
          const withCollected = orders.filter(
            (o) => o.modonCollectedPrice != null,
          );
          if (withCollected.length === 0) {
            return (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                لا توجد بيانات سعر مدن في هذه الصفحة — ستظهر الإحصائيات بعد
                المزامنة التالية
              </div>
            );
          }
          const diffOrders = withCollected.filter(
            (o) => Number(o.modonCollectedPrice) !== Number(o.totalPrice),
          );
          const totalExpected = withCollected.reduce(
            (s, o) => s + Number(o.totalPrice),
            0,
          );
          const totalCollected = withCollected.reduce(
            (s, o) => s + Number(o.modonCollectedPrice),
            0,
          );
          const totalDiff = totalCollected - totalExpected;
          return (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex flex-wrap gap-4 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">
                  طلبات مع سعر مدن
                </span>
                <span className="font-semibold">{withCollected.length}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">
                  طلبات مختلفة السعر
                </span>
                <span
                  className={`font-semibold ${diffOrders.length > 0 ? "text-red-600" : "text-green-700"}`}
                >
                  {diffOrders.length}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">
                  إجمالي المتوقع
                </span>
                <span className="font-semibold">
                  {formatCurrency(totalExpected)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">
                  إجمالي المستلم
                </span>
                <span className="font-semibold">
                  {formatCurrency(totalCollected)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">
                  الفرق الكلي
                </span>
                <span
                  className={`font-semibold ${totalDiff < 0 ? "text-red-600" : totalDiff > 0 ? "text-amber-600" : "text-green-700"}`}
                >
                  {totalDiff >= 0 ? "+" : ""}
                  {formatCurrency(totalDiff)}
                </span>
              </div>
            </div>
          );
        })()}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className="mx-2"
                />
              </TableHead>
              <TableHead>{t("sequence")}</TableHead>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>
                <Link
                  href={createSortUrl("product")}
                  className={`flex items-center gap-1 hover:text-primary ${sort === "product" ? "text-primary font-bold" : ""}`}
                  title={t("sortByProduct")}
                >
                  {t("product")}
                  {sort === "product" && <ChevronDown className="w-3 h-3" />}
                </Link>
              </TableHead>
              <TableHead>{t("whatsapp")}</TableHead>
              <TableHead>{t("phoneNumber")}</TableHead>
              <TableHead>{t("governorate")}</TableHead>
              <TableHead>{t("address")}</TableHead>
              <TableHead>{t("quantity")}</TableHead>
              <TableHead>{t("price")}</TableHead>
              <TableHead className="text-center">
                {t("actualShippingCost")}
              </TableHead>
              <TableHead>{t("notes")}</TableHead>
              <TableHead className="min-w-[140px] whitespace-nowrap">
                {t("status")}
              </TableHead>
              {showBarcode && <TableHead>باركود</TableHead>}
              {showCollectedPrice && <TableHead>سعر مدن</TableHead>}
              <TableHead className="w-[100px] text-center">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, index) => (
              <OrderRow
                key={order.id}
                order={order}
                index={index}
                isSelected={selectedOrders.includes(order.id)}
                onToggle={toggleOrder}
                onEdit={handleEdit}
                onResend={handleResend}
                t={t}
                tGov={tGov}
                showBarcode={showBarcode}
                showCollectedPrice={showCollectedPrice}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
