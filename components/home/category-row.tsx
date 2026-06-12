import { getAllCategories } from "@/lib/actions/product.actions";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Tag } from "lucide-react";

const CategoryRow = async () => {
  const categories = await getAllCategories();
  const t = await getTranslations("Search");

  if (!categories.length) return null;

  return (
    <section className="my-6">
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-none pb-1">
        <Link
          href="/search"
          className="filter-chip border-border hover:border-primary hover:text-primary hover:bg-primary/5 shrink-0"
        >
          <Tag className="w-3.5 h-3.5" />
          {t("all")}
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.category}
            href={`/search?category=${encodeURIComponent(cat.category)}`}
            className="filter-chip border-border hover:border-primary hover:text-primary hover:bg-primary/5 shrink-0"
          >
            {cat.category}
            <span className="text-muted-foreground text-[11px]">({cat._count})</span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default CategoryRow;
