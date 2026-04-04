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
import { useState, useTransition } from "react";
import {
  bulkUpdateOrderStatus,
  deleteOrder,
} from "@/lib/actions/order.actions";
import DeleteDialog from "@/components/shared/delete-dialog";
import { PAGE_SIZE } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import UpdateOrderForm from "./update-order-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, Pencil, Eye, MessageCircle, ChevronUp, Package } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export default function OrdersTable({
  orders,
  page,
  count,
  sort,
}: {
  orders: any[];
  page: number;
  count: number;
  sort?: string;
}) {
  const t = useTranslations("Admin");

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

  // Aggregate per-product breakdown: { name -> { total, orderCount, breakdown: { qty -> orderCount } } }
  const productSummary = orders.reduce<
    Record<string, { total: number; orderCount: number; breakdown: Record<number, number> }>
  >((acc, order) => {
    if (order.orderitems) {
      for (const item of order.orderitems) {
        const qty: number = item.qty ?? 1;
        if (!acc[item.name]) {
          acc[item.name] = { total: 0, orderCount: 0, breakdown: {} };
        }
        acc[item.name].total += qty;
        acc[item.name].orderCount += 1;
        acc[item.name].breakdown[qty] = (acc[item.name].breakdown[qty] ?? 0) + 1;
      }
    }
    return acc;
  }, {});
  const summaryEntries = Object.entries(productSummary).sort(
    (a, b) => b[1].total - a[1].total
  );

  // Toggle all
  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(orders.map((o) => o.id));
    } else {
      setSelectedOrders([]);
    }
  };

  // Toggle single
  const toggleOrder = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedOrders((prev) => [...prev, id]);
    } else {
      setSelectedOrders((prev) => prev.filter((o) => o !== id));
    }
  };

  const isAllSelected =
    orders.length > 0 && selectedOrders.length === orders.length;

  const handleBulkUpdate = (status: string) => {
    startTransition(async () => {
      const res = await bulkUpdateOrderStatus(selectedOrders, status);
      if (res.success) {
        toast({
          title: "Success",
          description: res.message,
        });
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

  const statuses = [
    "home",
    "account",
    "pending",
    "completed",
    "completedAccountant",
    "returned",
    "waiting",
    "unavailable",
    "banned",
  ];

  return (
    <div className="space-y-4">
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
                ({summaryEntries.length} منتج، {summaryEntries.reduce((s, [, { total }]) => s + total, 0)} قطعة)
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
              {summaryEntries.map(([name, { total, orderCount, breakdown }]) => {
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
                      <span className="text-sm font-semibold leading-tight">{name}</span>
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
              })}
            </div>
          )}
        </div>
      )}

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
              <TableHead>{t("actualShippingCost")}</TableHead>
              <TableHead>{t("notes")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="w-[100px]">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, index) => (
              <TableRow
                key={order.id}
                data-state={
                  selectedOrders.includes(order.id) ? "selected" : undefined
                }
              >
                <TableCell>
                  <Checkbox
                    checked={selectedOrders.includes(order.id)}
                    onCheckedChange={(checked) =>
                      toggleOrder(order.id, checked as boolean)
                    }
                    aria-label={`Select order ${order.id}`}
                    className="mx-2"
                  />
                </TableCell>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  {formatDateTime(order.createdAt).dateTime}
                </TableCell>
                <TableCell>{order.fullName}</TableCell>
                <TableCell>
                  {order.orderitems && order.orderitems.length > 0
                    ? order.orderitems.map((item: any) => item.name).join(", ")
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
                <TableCell>{tGov(order.governorate as any)}</TableCell>
                <TableCell>{order.address}</TableCell>
                <TableCell>{order.quantity}</TableCell>
                <TableCell>{formatCurrency(order.totalPrice)}</TableCell>
                <TableCell>
                  {formatCurrency(order.actualShippingCost ?? 0)}
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate"
                  title={order.notes || ""}
                >
                  {order.notes || "-"}
                </TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      order.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : order.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : order.status === "returned" ||
                              order.status === "banned"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {t(`Orders.Status.${order.status}`) || order.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Dialog
                      open={openEdit && editingOrder?.id === order.id}
                      onOpenChange={(open) => {
                        setOpenEdit(open);
                        if (open) setEditingOrder(order);
                        else setEditingOrder(null);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" title={t("edit")}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{t("edit")}</DialogTitle>
                        </DialogHeader>
                        <UpdateOrderForm order={order} setOpen={setOpenEdit} />
                      </DialogContent>
                    </Dialog>

                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      title={t("details")}
                    >
                      <Link href={`/order/${order.id}`}>
                        <span className="sr-only">{t("details")}</span>
                        <Eye className="w-4 h-4" />
                      </Link>
                    </Button>
                    <DeleteDialog id={order.id} action={deleteOrder} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
