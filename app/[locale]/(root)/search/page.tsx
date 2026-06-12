import ProductCard from "@/components/shared/product/product-card";
import { Button } from "@/components/ui/button";
import {
  getAllProducts,
  getAllCategories,
} from "@/lib/actions/product.actions";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SearchFilters from "@/components/shared/product/search-filters";
import { Product } from "@/types";
import dynamic from "next/dynamic";
import { X } from "lucide-react";

const MobileFilters = dynamic(
  () => import("@/components/shared/product/mobile-filters"),
  { ssr: true }
);

const ratings = [4, 3, 2, 1];
const sortOrders = ["newest", "lowest", "highest", "rating"];

export async function generateMetadata(props: {
  searchParams: Promise<{
    q: string;
    category: string;
    price: string;
    rating: string;
  }>;
}) {
  const {
    q = "all",
    category = "all",
    price = "all",
    rating = "all",
  } = await props.searchParams;

  const t = await getTranslations("SearchPage");

  const isQuerySet = q && q !== "all" && q.trim() !== "";
  const isCategorySet = category && category !== "all" && category.trim() !== "";
  const isPriceSet = price && price !== "all" && price.trim() !== "";
  const isRatingSet = rating && rating !== "all" && rating.trim() !== "";

  if (isQuerySet || isCategorySet || isPriceSet || isRatingSet) {
    return {
      title: `${t("title")} ${isQuerySet ? q : ""} ${isCategorySet ? `- ${category}` : ""}`,
    };
  }
  return { title: t("title") };
}

const SearchPage = async (props: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    price?: string;
    rating?: string;
    sort?: string;
    page?: string;
  }>;
}) => {
  const {
    q = "all",
    category = "all",
    price = "all",
    rating = "all",
    sort = "newest",
    page = "1",
  } = await props.searchParams;

  const t = await getTranslations("SearchPage");

  const getFilterUrl = ({
    c,
    p,
    s,
    r,
    pg,
  }: {
    c?: string;
    p?: string;
    s?: string;
    r?: string;
    pg?: string;
  }) => {
    const params = { q, category, price, rating, sort, page };
    if (c) params.category = c;
    if (p) params.price = p;
    if (s) params.sort = s;
    if (r) params.rating = r;
    if (pg) params.page = pg;
    return `/search?${new URLSearchParams(params).toString()}`;
  };

  const products = await getAllProducts({
    query: q,
    category,
    price,
    rating,
    sort,
    page: Number(page),
  });

  const categories = await getAllCategories();

  const prices = [
    { name: `1,000 - 50,000 د.ع`, value: "1-50" },
    { name: `51,000 - 100,000 د.ع`, value: "51-100" },
    { name: `101,000 - 200,000 د.ع`, value: "101-200" },
    { name: `201,000 - 500,000 د.ع`, value: "201-500" },
    { name: `501,000 - 1,000,000 د.ع`, value: "501-1000" },
  ];

  const activeFilters: { label: string; clearUrl: string }[] = [];
  if (q !== "all" && q !== "")
    activeFilters.push({ label: `"${q}"`, clearUrl: getFilterUrl({ c: undefined }) });
  if (category !== "all" && category !== "")
    activeFilters.push({ label: category, clearUrl: getFilterUrl({ c: "all" }) });
  if (price !== "all")
    activeFilters.push({ label: price.replace("-", " - ") + " د.ع", clearUrl: getFilterUrl({ p: "all" }) });
  if (rating !== "all")
    activeFilters.push({ label: `${rating}★+`, clearUrl: getFilterUrl({ r: "all" }) });

  const hasFilters = activeFilters.length > 0;

  return (
    <div className="flex gap-6">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:block w-56 shrink-0">
        <div className="sticky top-24 rounded-2xl border bg-card p-5">
          <SearchFilters
            categories={categories}
            prices={prices}
            ratings={ratings}
            translations={{
              category: t("category"),
              price: t("price"),
              customerRatings: t("customerRatings"),
              any: t("any"),
              starsAndUp: t("starsAndUp"),
            }}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mobile filter trigger */}
            <div className="md:hidden">
              <MobileFilters
                categories={categories}
                prices={prices}
                ratings={ratings}
                translations={{
                  category: t("category"),
                  price: t("price"),
                  customerRatings: t("customerRatings"),
                  any: t("any"),
                  starsAndUp: t("starsAndUp"),
                  filter: t("filter"),
                }}
              />
            </div>

            {/* Active filter chips */}
            {activeFilters.map((f, i) => (
              <Link
                key={i}
                href={f.clearUrl}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors"
              >
                {f.label}
                <X className="w-3 h-3" />
              </Link>
            ))}
            {hasFilters && (
              <Button variant="ghost" size="sm" asChild className="text-xs h-7 text-muted-foreground">
                <Link href="/search">{t("clear")}</Link>
              </Button>
            )}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground shrink-0 text-xs">{t("sortBy")}:</span>
            <div className="flex gap-1">
              {sortOrders.map((s) => (
                <Link
                  key={s}
                  href={getFilterUrl({ s })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    sort === s
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(s as any)}
                </Link>
              ))}
            </div>
          </div>
        </div>


        {/* Product Grid */}
        {products.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="text-6xl">🔍</div>
            <p className="text-lg font-semibold">{t("noResults")}</p>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/search">{t("clear")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {products.data.map((product: Product, index: number) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
