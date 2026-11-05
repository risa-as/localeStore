"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AppSelectOption = {
  value: string;
  label: string;
  /** سطر توضيحي صغير تحت الاسم. */
  hint?: string;
  /** صنف لون لنقطة صغيرة قبل الاسم (مثل bg-sky-500). */
  dot?: string;
  /** كلمات إضافية يطابقها البحث. */
  keywords?: string[];
  disabled?: boolean;
};

type AppSelectProps = {
  options: AppSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** يُرسل مع النموذج بهذا الاسم. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  size?: "sm" | "md";
  className?: string;
  contentClassName?: string;
  /** يظهر حقل البحث تلقائياً عند أكثر من 8 خيارات. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** عنوان صغير أعلى القائمة. */
  title?: string;
};

/**
 * قائمة اختيار موحّدة للنظام بدل <select> الافتراضي: نقطة لون، سطر توضيحي،
 * علامة ✓ للخيار الحالي، وبحث للقوائم الطويلة. تعمل داخل النماذج (name/required)
 * وداخل النوافذ.
 */
export function AppSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  disabled,
  id,
  placeholder = "اختر…",
  "aria-label": ariaLabel,
  size = "md",
  className,
  contentClassName,
  searchable,
  searchPlaceholder = "ابحث…",
  title,
}: AppSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current);
  const withSearch = searchable ?? options.length > 8;

  const choose = (next: string) => {
    if (value === undefined) setInner(next);
    if (next !== current) onValueChange?.(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <div className={cn("relative w-full min-w-0", className)}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            id={id}
            aria-haspopup="listbox"
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "group flex w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-background text-start shadow-sm outline-none ring-offset-background transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-foreground/40 data-[state=open]:ring-2 data-[state=open]:ring-ring/15",
              size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm",
            )}
          >
            {selected?.dot && <span className={cn("size-2 shrink-0 rounded-full", selected.dot)} />}
            <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronDown
              className={cn(
                "shrink-0 opacity-50 transition-transform group-data-[state=open]:rotate-180",
                size === "sm" ? "size-3.5" : "size-4",
              )}
            />
          </button>
        </PopoverTrigger>
        {name && (
          // نص مخفي بدل hidden حتى يتحقق المتصفح من «required».
          <input
            tabIndex={-1}
            aria-hidden
            name={name}
            value={current}
            required={required}
            onChange={() => {}}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
          />
        )}
      </div>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn("w-[var(--radix-popover-trigger-width)] min-w-[13rem] max-w-[calc(100vw-2rem)] rounded-xl p-1.5 shadow-lg", contentClassName)}
        onOpenAutoFocus={(e) => {
          // بلا بحث: لا يُفتح لوح المفاتيح على الهاتف.
          if (!withSearch) e.preventDefault();
        }}
      >
        <CommandPrimitive shouldFilter={withSearch} loop className="flex flex-col">
          {title && <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">{title}</p>}
          {withSearch && (
            <div className="mb-1 flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5">
              <Search className="size-4 shrink-0 opacity-50" />
              <CommandPrimitive.Input
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <CommandPrimitive.List className="max-h-72 overflow-y-auto overscroll-contain">
            <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">لا نتائج</CommandPrimitive.Empty>
            {options.map((o, i) => {
              const active = o.value === current;
              return (
                <CommandPrimitive.Item
                  key={`${o.value}:${i}`}
                  // قيمة cmdk للبحث فقط؛ القيمة الفعلية تُؤخذ من الخيار نفسه.
                  value={`${o.label} ${i}`}
                  keywords={o.keywords}
                  disabled={o.disabled}
                  onSelect={() => choose(o.value)}
                  className={cn(
                    "flex cursor-pointer select-none items-start gap-2.5 rounded-lg px-2 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[disabled=true]:opacity-50",
                    active && "bg-muted/70",
                  )}
                >
                  {o.dot && <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", o.dot)} />}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block break-words", active && "font-medium")}>{o.label}</span>
                    {o.hint && <span className="block text-[11px] leading-4 text-muted-foreground">{o.hint}</span>}
                  </span>
                  {active && <Check className="mt-0.5 size-4 shrink-0" />}
                </CommandPrimitive.Item>
              );
            })}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
