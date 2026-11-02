"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateImportSettings, type ImportSettingsDTO } from "@/lib/actions/import.actions";
import { fmtKExact } from "./format";

type Key = keyof ImportSettingsDTO;

const FIELDS: { key: Key; label: string; hint?: string; group: string }[] = [
  { key: "alibabaFeePct", label: "عمولة علي بابا (٪)", hint: "على البضاعة + الشحن", group: "العمولات" },
  { key: "cardFeePct", label: "عمولة البطاقة (٪)", hint: "تشمل فرق صرف البنك", group: "العمولات" },
  { key: "cardFixedUsd", label: "رسوم البطاقة الثابتة ($)", hint: "لكل عملية دفع", group: "العمولات" },
  { key: "opsCostPerUnitKiqd", label: "تكاليف التشغيل للقطعة (بالألف)", hint: "تغليف وما شابه — 0.05 = 50 د.ع", group: "التكاليف والبيع" },
  { key: "defaultDeliveryRatePct", label: "نسبة نجاح التوصيل الافتراضية (٪)", group: "التكاليف والبيع" },
  { key: "defaultCpaUsd", label: "تكلفة الإعلان لكل طلب الافتراضية ($)", group: "التكاليف والبيع" },
  { key: "targetMarginPct", label: "هامش الربح المستهدف (٪)", hint: "حد الإشارة الخضراء", group: "التكاليف والبيع" },
  { key: "historyWindowDays", label: "فترة الأرقام الفعلية (يوم)", hint: "240 يوم = 8 أشهر", group: "إعادة الاستيراد" },
  { key: "minHistoryOrders", label: "أقل عدد طلبات للثقة", group: "إعادة الاستيراد" },
  { key: "leadTimeDays", label: "مدة وصول الشحنة (يوم)", group: "إعادة الاستيراد" },
  { key: "reorderCoverDays", label: "أيام تغطيها الكمية المقترحة", group: "إعادة الاستيراد" },
];

export default function ImportSettingsDialog({ settings }: { settings: ImportSettingsDTO }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<Key, string>>(
    () => Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])) as Record<Key, string>,
  );

  const save = () =>
    startTransition(async () => {
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, Number(v)]),
      ) as ImportSettingsDTO;
      const res = await updateImportSettings(payload);
      toast({ variant: res.success ? "default" : "destructive", description: res.message });
      if (res.success) {
        setOpen(false);
        router.refresh();
      }
    });

  const groups = [...new Set(FIELDS.map((f) => f.group))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          الإعدادات الافتراضية
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>إعدادات الاستيراد</DialogTitle>
          <DialogDescription>
            تُعبّأ تلقائياً في كل منتج مرشح جديد، ويمكن تعديلها لكل منتج على حدة. المبالغ بالدينار بوحدة الألف مثل بقية المتجر.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g} className="space-y-3">
              <p className="text-sm font-semibold">{g}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.filter((f) => f.group === g).map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`is-${f.key}`} className="text-xs">{f.label}</Label>
                    <Input
                      id={`is-${f.key}`}
                      type="number"
                      step="any"
                      dir="ltr"
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                    {f.key === "opsCostPerUnitKiqd" ? (
                      <p className="text-[11px] text-muted-foreground">= {fmtKExact(Number(values[f.key]))}</p>
                    ) : f.hint ? (
                      <p className="text-[11px] text-muted-foreground">{f.hint}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
