"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  bulkUpdateOrderStatusByDateRange,
  countOrdersByDateAndStatus,
} from "@/lib/actions/order.actions";
import { CalendarRange, Loader2, ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

const STATUSES = [
  "home",
  "pending",
  "completed",
  "completedAccountant",
  "returned",
  "waiting",
  "unavailable",
  "banned",
];

export default function BulkUpdateByDateDialog() {
  const t = useTranslations("Admin");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fromStatus, setFromStatus] = useState("home");
  const [toStatus, setToStatus] = useState("pending");
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!from || !to) return;
    setIsCounting(true);
    try {
      const count = await countOrdersByDateAndStatus({
        from: new Date(from),
        to: new Date(to),
        fromStatus,
      });
      setMatchCount(count);
    } finally {
      setIsCounting(false);
    }
  }, [from, to, fromStatus]);

  // Refresh count whenever filters change
  useEffect(() => {
    if (open) refreshCount();
  }, [open, from, to, fromStatus, refreshCount]);

  const handleSubmit = () => {
    if (!from || !to || !fromStatus || !toStatus) return;
    if (fromStatus === toStatus) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الحالة المصدر والهدف متطابقتان",
      });
      return;
    }
    if (matchCount === 0) {
      toast({
        variant: "destructive",
        title: "لا توجد طلبات",
        description: "لا توجد طلبات مطابقة لهذه المعايير",
      });
      return;
    }

    startTransition(async () => {
      const res = await bulkUpdateOrderStatusByDateRange({
        from: new Date(from),
        to: new Date(to),
        fromStatus,
        toStatus,
      });

      if (res.success) {
        toast({
          title: "تم التحويل",
          description: `تم تحويل ${res.count} طلب بنجاح`,
        });
        setOpen(false);
        setMatchCount(null);
      } else {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: res.message,
        });
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setMatchCount(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarRange className="w-4 h-4" />
          {t("bulkUpdateByDate")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="w-5 h-5" />
            {t("bulkUpdateByDate")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("dateFrom")}</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("dateTo")}</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          {/* Status conversion */}
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>{t("fromStatus")}</Label>
              <Select value={fromStatus} onValueChange={setFromStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`Orders.Status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ArrowLeft className="w-5 h-5 mt-5 shrink-0 text-muted-foreground" />

            <div className="flex-1 space-y-1.5">
              <Label>{t("toStatus")}</Label>
              <Select value={toStatus} onValueChange={setToStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`Orders.Status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview count */}
          <div
            className={`rounded-lg p-3 text-sm border ${
              matchCount === 0
                ? "bg-red-50 border-red-200 text-red-700"
                : matchCount && matchCount > 0
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-muted/60 border-transparent text-muted-foreground"
            }`}
          >
            {isCounting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> جاري البحث...
              </span>
            ) : matchCount === null ? (
              "جاري التحميل..."
            ) : matchCount === 0 ? (
              <>
                لا توجد طلبات بحالة{" "}
                <strong>{t(`Orders.Status.${fromStatus}`)}</strong> في هذه
                الفترة. يرجى تعديل الحالة أو التاريخ.
              </>
            ) : (
              <>
                سيتم تحويل <strong>{matchCount} طلب</strong> من{" "}
                <strong>{t(`Orders.Status.${fromStatus}`)}</strong> إلى{" "}
                <strong>{t(`Orders.Status.${toStatus}`)}</strong>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || matchCount === 0 || matchCount === null}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            تأكيد التحويل{" "}
            {matchCount !== null && matchCount > 0 ? `(${matchCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
