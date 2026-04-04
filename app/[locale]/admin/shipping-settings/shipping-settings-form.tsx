"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateShippingSettings } from "@/lib/actions/shipping-settings.actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info } from "lucide-react";

export default function ShippingSettingsForm({
  baghdadCost,
  othersCost,
}: {
  baghdadCost: number;
  othersCost: number;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [baghdad, setBaghdad] = useState(String(baghdadCost));
  const [others, setOthers] = useState(String(othersCost));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateShippingSettings({
        baghdadCost: Number(baghdad),
        othersCost: Number(others),
      });
      toast({
        variant: res.success ? "default" : "destructive",
        title: res.success ? "تم الحفظ" : "خطأ",
        description: res.message,
      });
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card shadow-sm overflow-hidden">

      {/* Fields */}
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1 space-y-2">
            <Label className="text-sm font-medium">بغداد</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                value={baghdad}
                onChange={(e) => setBaghdad(e.target.value)}
                className="pr-16 text-center text-lg font-semibold"
              />
              <span className="absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground pointer-events-none">
                د.ع
              </span>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 space-y-2">
            <Label className="text-sm font-medium">باقي المحافظات</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                value={others}
                onChange={(e) => setOthers(e.target.value)}
                className="pr-16 text-center text-lg font-semibold"
              />
              <span className="absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground pointer-events-none">
                د.ع
              </span>
            </div>
          </div>
        </div>

        {/* Info note */}
        <div className="flex gap-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            عند انتهاء عرض شركة النقل، أعد الأسعار للقيم الاعتيادية
            <span className="font-medium text-foreground"> (بغداد: 4,000 — المحافظات: 5,000)</span>
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/30 px-6 py-4">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          حفظ الإعدادات
        </Button>
      </div>
    </form>
  );
}
