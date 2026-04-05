"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDealSettings } from "@/lib/actions/deal-settings.actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import Image from "next/image";

interface Product {
  id: string;
  name: string;
  image: string;
}

export default function DealSettingsForm({
  isActive,
  endDate,
  productId,
  title,
  products,
}: {
  isActive: boolean;
  endDate: string;
  productId: string;
  title: string;
  products: Product[];
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [active, setActive] = useState(isActive);
  const [date, setDate] = useState(
    endDate ? new Date(endDate).toISOString().slice(0, 16) : ""
  );
  const [selectedProduct, setSelectedProduct] = useState(productId);
  const [dealTitle, setDealTitle] = useState(title);
  const [search, setSearch] = useState("");

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateDealSettings({
        isActive: active,
        endDate: date,
        productId: selectedProduct || null,
        title: dealTitle,
      });
      toast({
        variant: res.success ? "default" : "destructive",
        title: res.success ? "تم الحفظ" : "خطأ",
        description: res.message,
      });
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-6 space-y-6">

        {/* Toggle active */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
          <div>
            <p className="font-semibold text-sm">تفعيل قسم الصفقة</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              عند التفعيل يظهر القسم في الصفحة الرئيسية
            </p>
          </div>
          <div dir="ltr">
            <Switch
              checked={active}
              onCheckedChange={setActive}
              className="data-[state=checked]:bg-green-500"
            />
          </div>
        </div>

        {active && (
          <>
            {/* Title */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">عنوان الصفقة</Label>
              <Input
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
                placeholder="صفقة الشهر"
              />
            </div>

            {/* End date */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">تاريخ انتهاء الصفقة</Label>
              <Input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Product selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                المنتج المعروض <span className="text-muted-foreground font-normal">(اختياري)</span>
              </Label>

              {/* Search */}
              <Input
                placeholder="ابحث عن منتج..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {/* None option */}
              <button
                type="button"
                onClick={() => setSelectedProduct("")}
                className={`flex items-center gap-3 w-full p-3 rounded-xl border text-sm font-medium transition-all ${
                  selectedProduct === ""
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted"
                }`}
              >
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                </div>
                <span>بدون صورة منتج</span>
              </button>

              {/* Product list */}
              <div className="max-h-56 overflow-y-auto space-y-2 scrollbar-none">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProduct(p.id)}
                    className={`flex items-center gap-3 w-full p-3 rounded-xl border text-sm font-medium transition-all text-start ${
                      selectedProduct === p.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    }`}
                  >
                    {p.image && (
                      <Image
                        src={p.image}
                        alt={p.name}
                        width={48}
                        height={48}
                        className="w-12 h-12 object-cover rounded-lg shrink-0"
                      />
                    )}
                    <span className="line-clamp-2">{p.name}</span>
                    {selectedProduct === p.id && (
                      <Eye className="w-4 h-4 text-primary shrink-0 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
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
