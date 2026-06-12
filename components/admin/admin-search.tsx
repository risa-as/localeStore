"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const AdminSearch = () => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Admin");
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(searchParams.get("query") || "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setValue(searchParams.get("query") || "");
  }, [searchParams]);

  // Ctrl+K or / focuses the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "k") || (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA")) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const formActionBase = pathname.includes("/admin/orders")
    ? "/admin/orders"
    : pathname.includes("/admin/users")
      ? "/admin/users"
      : "/admin/products";

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("query", value.trim());
      } else {
        params.delete("query");
      }
      params.delete("page");
      router.push(`${formActionBase}?${params.toString()}`);
    },
    [value, searchParams, formActionBase, router],
  );

  const handleClear = useCallback(() => {
    setValue("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("query");
    params.delete("page");
    router.push(`${formActionBase}?${params.toString()}`);
    inputRef.current?.focus();
  }, [searchParams, formActionBase, router]);

  const hasValue = value.length > 0;

  return (
    <form onSubmit={handleSubmit} className="relative w-full sm:w-72">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border bg-background px-3 transition-all duration-200",
          focused
            ? "border-primary ring-2 ring-primary/20 shadow-sm"
            : "border-input hover:border-muted-foreground/50",
        )}
      >
        <Search
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            focused ? "text-primary" : "text-muted-foreground",
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={pathname.includes("/admin/orders") ? t("ordersSearchPlaceholder") : t("searchPlaceholder")}
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {hasValue ? (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="مسح البحث"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 select-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            /
          </kbd>
        )}
      </div>
    </form>
  );
};

export default AdminSearch;
