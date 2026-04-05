import { Product } from "@/types";
import ProductCard from "./product-card";
import { useTranslations } from "next-intl";
import { PackageSearch } from "lucide-react";

const ProductList = ({
  data,
  title,
  limit,
}: {
  data: Product[];
  title?: string;
  limit?: number;
}) => {
  const limitedData = limit ? data.slice(0, limit) : data;
  const t = useTranslations("Product");

  return (
    <section className="my-8 sm:my-12">
      {(title || true) && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1.5 h-8 rounded-full bg-primary shrink-0" />
          <h2 className="shop-section-title">{title || t("title")}</h2>
        </div>
      )}

      {limitedData.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {limitedData.map((product: Product, index: number) => (
            <ProductCard key={product.id} product={product} priority={index < 6} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="p-5 rounded-full bg-muted">
            <PackageSearch className="w-10 h-10 text-muted-foreground" />
          </div>
          <p className="text-lg text-muted-foreground font-medium">{t("noProducts")}</p>
        </div>
      )}
    </section>
  );
};

export default ProductList;
