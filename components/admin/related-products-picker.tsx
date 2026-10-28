"use client";

import { useEffect, useId, useState } from "react";
import { Check, Loader2, PackagePlus, Search, X } from "lucide-react";
import { getRelatedProductOptions } from "@/lib/actions/product.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const searchKey = (text: string) => text.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[ىی]/g, "ي").replace(/ک/g, "ك").toLocaleLowerCase().trim();

export default function RelatedProductsPicker({ value = [], onChange, productId, disabled }: {
  value?: string[]; onChange: (ids: string[]) => void; productId?: string; disabled?: boolean;
}) {
  const id = useId();
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getRelatedProductOptions().then(items => { if (!cancelled) setOptions(items); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  const available = options.filter(option => option.id !== productId);
  const terms = searchKey(query).split(/\s+/).filter(Boolean);
  const results = available.filter(option => terms.every(term => searchKey(option.name).includes(term)));
  const limitReached = value.length >= 3;
  function toggle(optionId: string) {
    if (value.includes(optionId)) onChange(value.filter(selected => selected !== optionId));
    else if (!limitReached) onChange([...value, optionId]);
  }
  function retry() {
    setLoading(true); setError(false); setAttempt(prev => prev + 1);
  }

  return <fieldset disabled={disabled} aria-describedby={`${id}-description`} className="min-w-0 rounded-[10px] border bg-card p-4 sm:p-5 space-y-4">
    <legend className="sr-only">منتجات مكملة لهذا المنتج (حتى 3)</legend>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/5 text-primary"><PackagePlus className="size-5" /></span>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold">منتجات مكملة لهذا المنتج</h2>
        <p id={`${id}-description`} className="mt-1 text-xs leading-relaxed text-muted-foreground">اختر حتى 3 منتجات مناسبة؛ ستظهر للزبون لإضافتها إلى طلبه نفسه.</p>
      </div>
      <span aria-label={`المختار ${value.length} من 3`} className="shrink-0 rounded-[10px] border bg-muted/40 px-2.5 py-1 text-xs font-semibold tabular-nums" dir="ltr">{value.length} / 3</span>
    </div>

    <div className="rounded-[10px] bg-muted/35 p-3">
      <p className="mb-2 text-xs font-medium">المنتجات المختارة</p>
      {value.length ? <ul className="flex flex-wrap gap-2">{value.map(optionId => {
        const name = options.find(option => option.id === optionId)?.name || "منتج محفوظ";
        return <li key={optionId} className="flex max-w-full items-center gap-2 rounded-[10px] border bg-background py-1.5 ps-2.5 pe-1 text-xs">
          <Check aria-hidden="true" className="size-3.5 shrink-0 text-emerald-600" /><span className="min-w-0 break-words">{name}</span>
          <button type="button" aria-label={`إزالة ${name}`} onClick={() => onChange(value.filter(selected => selected !== optionId))}
            className="flex size-7 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><X className="size-3.5" /></button>
        </li>;
      })}</ul> : <p className="text-xs text-muted-foreground">لم تختر منتجات بعد. ابحث بالاسم أو اختر من القائمة أدناه.</p>}
    </div>

    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input aria-label="البحث عن منتج مكمل" placeholder="ابحث باسم المنتج…" value={query} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
        aria-controls={`${id}-results`} className="h-10 rounded-[10px] ps-9 pe-10" />
      {query && <button type="button" aria-label="مسح البحث" onClick={() => setQuery("")}
        className="absolute end-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" /></button>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" role="status">
      <span>{loading ? "جارٍ تحميل المنتجات…" : error ? "تعذر تحميل قائمة المنتجات" : `${results.length} منتج${terms.length ? ` من ${available.length}` : ""}`}</span>
      {limitReached && <span className="font-medium text-foreground">اكتمل الاختيار؛ أزل منتجاً لاستبداله.</span>}
    </div>
    <div id={`${id}-results`} aria-busy={loading} className="max-h-64 overflow-y-auto overscroll-contain rounded-[10px] border p-2">
      {loading ? <p className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin" />جارٍ تحميل المنتجات…</p>
        : error ? <div className="flex min-h-28 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><p>تعذر تحميل المنتجات. اختياراتك الحالية محفوظة في النموذج.</p><Button type="button" size="sm" variant="outline" className="rounded-[10px]" onClick={retry}>إعادة المحاولة</Button></div>
          : !results.length ? <div className="flex min-h-28 flex-col items-center justify-center gap-1 text-center text-sm"><p>{terms.length ? "لا توجد منتجات مطابقة للبحث" : "لا توجد منتجات أخرى للاختيار"}</p>{terms.length > 0 && <p className="text-xs text-muted-foreground">جرّب كلمة أخرى أو امسح البحث.</p>}</div>
            : <div className="grid gap-2 sm:grid-cols-2">{results.map(option => {
              const checked = value.includes(option.id), unavailable = !checked && limitReached;
              return <label key={option.id} className={`flex min-w-0 items-center gap-3 rounded-[10px] border p-3 text-sm transition-colors ${checked ? "border-primary/35 bg-primary/5" : unavailable ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:border-primary/30 hover:bg-muted/50"}`}>
                <input type="checkbox" checked={checked} disabled={unavailable} onChange={() => toggle(option.id)}
                  className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                <span className="min-w-0 flex-1 break-words leading-relaxed">{option.name}</span>
                {checked && <span className="sr-only">مختار</span>}
              </label>;
            })}</div>}
    </div>
    <p className="text-xs text-muted-foreground">تُحفظ الاختيارات عند حفظ بيانات المنتج.</p>
  </fieldset>;
}
