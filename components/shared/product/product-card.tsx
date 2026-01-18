import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import ProductPrice from "./product-price";
import { Product } from "@/types";
import Rating from "./rating";
import { useTranslations } from "next-intl";

const ProductCard = ({ product }: { product: Product }) => {
  const t = useTranslations('Product');
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="p-0">
        <Link href={`/product/${product.slug}`}>
          <Image
            src={product.images[0]}
            alt={product.name}
            width={300}
            height={300}
            priority={true}
            className="aspect-square object-cover rounded-t-lg"
          />
        </Link>
      </CardHeader>
      <CardContent className="p-4 grid gap-4">

        <Link href={`/product/${product.slug}`}>
          <h2 className="text-sm font-medium">{product.name}</h2>
        </Link>
        <div className="flex-between gap-4">
          <Rating value={Number(product.rating)} />
          {product.stock > 0 ? (
            <ProductPrice value={Number(product.price)} />
          ) : (
            <p className="text-destructive">{t('outOfStock')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductCard;
