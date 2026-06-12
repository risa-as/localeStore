"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Filter, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileFiltersProps {
  categories: { category: string; _count: number }[];
  prices: { name: string; value: string }[];
  ratings: number[];
  translations: {
    category: string;
    price: string;
    customerRatings: string;
    any: string;
    starsAndUp: string;
    filter: string;
  };
}

const MobileFilters = ({
  categories,
  prices,
  ratings,
  translations,
}: MobileFiltersProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get("category") || "all";
  const currentPrice = searchParams.get("price") || "all";
  const currentRating = searchParams.get("rating") || "all";

  const hasFilters =
    currentCategory !== "all" || currentPrice !== "all" || currentRating !== "all";

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
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 h-9 rounded-xl font-semibold",
            hasFilters && "border-primary text-primary"
          )}
        >
          <Filter className="w-4 h-4" />
          {translations.filter}
          {hasFilters && (
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {[currentCategory !== "all", currentPrice !== "all", currentRating !== "all"].filter(Boolean).length}
            </span>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-lg font-bold">{translations.filter}</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 space-y-6 max-h-[65vh] overflow-y-auto">
            {/* Category */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                {translations.category}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggle("category", "all", currentCategory)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                    currentCategory === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  {translations.any}
                </button>
                {categories.map((x) => (
                  <button
                    key={x.category}
                    onClick={() => toggle("category", x.category, currentCategory)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                      currentCategory === x.category
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                  >
                    {x.category}
                    <span className="ms-1 text-xs opacity-70">({x._count})</span>
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
                    "w-full text-start px-3 py-2.5 rounded-xl text-sm font-medium border transition-all",
                    currentPrice === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  {translations.any}
                </button>
                {prices.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => toggle("price", p.value, currentPrice)}
                    className={cn(
                      "w-full text-start px-3 py-2.5 rounded-xl text-sm font-medium border transition-all leading-snug",
                      currentPrice === p.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted"
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
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggle("rating", "all", currentRating)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                    currentRating === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  {translations.any}
                </button>
                {ratings.map((r) => (
                  <button
                    key={r}
                    onClick={() => toggle("rating", r.toString(), currentRating)}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                      currentRating === r.toString()
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                  >
                    <Star
                      className={cn(
                        "w-3.5 h-3.5 fill-current",
                        currentRating === r.toString() ? "text-yellow-300" : "text-yellow-400"
                      )}
                    />
                    {r}+ {translations.starsAndUp}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DrawerFooter className="pt-4">
            <DrawerClose asChild>
              <Button variant="outline" className="rounded-xl">
                {translations.any === "الكل" ? "إغلاق" : "Close"}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileFilters;
