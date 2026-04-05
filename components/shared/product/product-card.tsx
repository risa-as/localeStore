import Link from "next/link";
import { AccessibleImage } from "@/components/ui/accessible-image";
import ProductPrice from "./product-price";
import { Product } from "@/types";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";

const ProductCard = ({ product, priority = false }: { product: Product; priority?: boolean }) => {
  const t = useTranslations("Product");

  return (
    <article className="group flex flex-col rounded-2xl border bg-card overflow-hidden hover:shadow-lg hover:border-primary/20 transition-all duration-300 hover:-translate-y-0.5">
      {/* Image */}
      <Link href={`/product/${product.slug}`} className="block relative overflow-hidden">
        <div className="aspect-square bg-muted/30 relative overflow-hidden">
          <AccessibleImage
            src={product.images[0]}
            alt={product.name}
            width={500}
            height={500}
            priority={priority}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {product.stock <= 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="bg-destructive text-white text-sm font-bold px-4 py-2 rounded-xl">
                {t("outOfStock")}
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 sm:p-4 gap-2">
        {product.category && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {product.category}
          </span>
        )}

        <Link href={`/product/${product.slug}`} className="flex-1">
          <h2 className="text-sm sm:text-base font-semibold leading-snug line-clamp-2 hover:text-primary transition-colors">
            {product.name}
          </h2>
        </Link>

        <div className="flex items-center justify-between mt-auto pt-1">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs text-muted-foreground font-medium">
              {Number(product.rating).toFixed(1)}
            </span>
          </div>

          {/* Price */}
          {product.stock > 0 ? (
            <ProductPrice
              value={Number(product.price)}
              className="text-base sm:text-lg font-extrabold"
            />
          ) : (
            <span className="text-xs font-semibold text-destructive">{t("outOfStock")}</span>
          )}
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
