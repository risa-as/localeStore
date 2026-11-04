import { Link } from "@/i18n/navigation";
import { AccessibleImage } from "@/components/ui/accessible-image";
import ProductPrice from "./product-price";
import { Product } from "@/types";
import { Star } from "lucide-react";

const ProductCard = ({ product, priority = false, returnTo }: { product: Product; priority?: boolean; returnTo?: string }) => {
  const href = `/product/${product.slug}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <article className="group flex flex-col rounded-2xl border bg-card overflow-hidden hover:shadow-lg hover:border-primary/20 transition-all duration-300 hover:-translate-y-0.5">
      {/* Image */}
      <Link href={href} className="block relative overflow-hidden">
        <div className="aspect-square bg-muted/30 relative overflow-hidden">
          <AccessibleImage
            src={product.images[0]}
            alt={product.name}
            width={500}
            height={500}
            priority={priority}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      </Link>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 sm:p-4 gap-2">
        {product.categories?.length > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {product.categories[0]}
          </span>
        )}

        <Link href={href} className="flex-1">
          <h2 className="text-sm sm:text-base font-semibold leading-snug line-clamp-2 hover:text-primary transition-colors">
            {product.name}
          </h2>
        </Link>

        <div className="flex items-center justify-between mt-auto pt-1">
          {/* Rating */}
          {product.numReviews > 0 ? <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs text-muted-foreground font-medium">
              {Number(product.rating).toFixed(1)}
            </span>
          </div> : <span />}

          {/* Price */}
          <ProductPrice
            value={Number(product.price)}
            className="text-base sm:text-lg font-extrabold"
          />
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
