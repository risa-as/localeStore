"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchFiltersProps {
  categories: { category: string; _count: number }[];
  prices: { name: string; value: string }[];
  ratings: number[];
  translations: {
    category: string;
    price: string;
    customerRatings: string;
    any: string;
    starsAndUp: string;
  };
}

const SearchFilters = ({
  categories,
  prices,
  ratings,
  translations,
}: SearchFiltersProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get("category") || "all";
  const currentPrice = searchParams.get("price") || "all";
  const currentRating = searchParams.get("rating") || "all";

  const buildUrl = (params: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => {
      if (!v || v === "all") p.delete(k);
      else p.set(k, v);
    });
    return `/search?${p.toString()}`;
  };

  const toggle = (key: string, value: string, current: string) => {
    const next = current === value ? "all" : value;
    router.push(buildUrl({ [key]: next, page: "1" }));
  };

  return (
    <div className="space-y-6">
      {/* Categories */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          {translations.category}
        </p>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => toggle("category", "all", currentCategory)}
            className={cn(
              "flex items-center justify-between w-full text-start px-3 py-2 rounded-lg text-sm font-medium transition-all",
              currentCategory === "all"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            )}
          >
            <span>{translations.any}</span>
          </button>
          {categories.map((x) => (
            <button
              key={x.category}
              onClick={() => toggle("category", x.category, currentCategory)}
              className={cn(
                "flex items-center justify-between w-full text-start px-3 py-2 rounded-lg text-sm font-medium transition-all",
                currentCategory === x.category
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              )}
            >
              <span>{x.category}</span>
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium",
                  currentCategory === x.category
                    ? "bg-white/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {x._count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Price */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          {translations.price}
        </p>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => toggle("price", "all", currentPrice)}
            className={cn(
              "w-full text-start px-3 py-2 rounded-lg text-sm font-medium transition-all",
              currentPrice === "all"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            )}
          >
            {translations.any}
          </button>
          {prices.map((p) => (
            <button
              key={p.value}
              onClick={() => toggle("price", p.value, currentPrice)}
              className={cn(
                "w-full text-start px-3 py-2 rounded-lg text-sm font-medium transition-all leading-snug",
                currentPrice === p.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Rating */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          {translations.customerRatings}
        </p>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => toggle("rating", "all", currentRating)}
            className={cn(
              "w-full text-start px-3 py-2 rounded-lg text-sm font-medium transition-all",
              currentRating === "all"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            )}
          >
            {translations.any}
          </button>
          {ratings.map((r) => (
            <button
              key={r}
              onClick={() => toggle("rating", r.toString(), currentRating)}
              className={cn(
                "flex items-center gap-1.5 w-full text-start px-3 py-2 rounded-lg text-sm font-medium transition-all",
                currentRating === r.toString()
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              )}
            >
              {Array.from({ length: r }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "w-3.5 h-3.5 fill-current",
                    currentRating === r.toString() ? "text-yellow-300" : "text-yellow-400"
                  )}
                />
              ))}
              <span className="ml-0.5">{translations.starsAndUp}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchFilters;
