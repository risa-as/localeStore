import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { getProductBySlug } from "@/lib/actions/product.actions";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "المنتج غير موجود" };
  return {
    title: product.name,
    description: product.description,
  };
}
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import ProductPrice from "@/components/shared/product/product-price";
import ProductImages from "@/components/shared/product/product-images";
import AddToCart from "@/components/shared/product/add-to-cart";
import { getMyCart } from "@/lib/actions/cart.actions";
import { auth } from "@/auth";
import ReviewList from "./review-list";
import Rating from "@/components/shared/product/rating";
import { getReviews } from "@/lib/actions/review.actions";
import { Truck, Star, Tag, CheckCircle2, Package, ChevronLeft, Home } from "lucide-react";
import { Link } from "@/i18n/navigation";
import BrowseBack from "@/components/shared/product/browse-back";
import { getAvailableStock } from "@/lib/inventory";
import StoreTelemetry from "@/components/shared/store-telemetry";

const ProductDetailsPage = async (props: {
  params: Promise<{ slug: string }>;
}) => {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return notFound();

  const [session, cart, t, reviews, availableStock] = await Promise.all([
    auth(), getMyCart(), getTranslations("Product"),
    getReviews({ productId: product.id }), getAvailableStock(product.id, product.stock),
  ]);
  const userId = session?.user?.id;

  return (
    <>
      <StoreTelemetry name="view_product" productId={product.id}/>
      <BrowseBack />
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground py-4 flex-wrap">
        <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <Home className="w-3.5 h-3.5" />
          الرئيسية
        </Link>
        <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
        <Link
          href="/search"
          className="hover:text-foreground transition-colors"
        >
          المنتجات
        </Link>
        {product.categories?.[0] && (
          <>
            <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
            <Link
              href={`/search?category=${encodeURIComponent(product.categories[0])}`}
              className="hover:text-foreground transition-colors"
            >
              {product.categories[0]}
            </Link>
          </>
        )}
        <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {product.name}
        </span>
      </nav>

      {availableStock > 0 && <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <a href="#purchase" className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground">{t("addToCart")}</a>
      </div>}
      <section className="py-5 sm:py-8 pb-24 md:pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 sm:gap-8">

          {/* Images — left */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl overflow-hidden border-2 bg-muted/10">
              <ProductImages images={product.images} />
            </div>
          </div>

          {/* Info — center */}
          <div className="lg:col-span-2 space-y-5">
            {/* Category badges */}
            {product.categories?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.categories.map((cat: string) => (
                  <span key={cat} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                    <Tag className="w-3.5 h-3.5" />
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {/* Name */}
            <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">{product.name}</h1>

            {/* Rating */}
            {product.numReviews > 0 && <div className="flex items-center gap-3">
              <Rating value={Number(product.rating)} />
              <span className="text-sm text-muted-foreground font-medium">
                ({product.numReviews} {t("reviews")})
              </span>
            </div>}

            {/* Price — big and bold */}
            <div className="py-3 px-4 rounded-2xl bg-primary/5 border border-primary/15 inline-block">
              <ProductPrice
                value={parseFloat(product.price)}
                className="text-3xl font-extrabold text-primary"
              />
            </div>

            {/* Description */}
            <details className="space-y-2">
              <summary className="text-base font-bold cursor-pointer">{t("description")}</summary>
              <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </details>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-2">
              {Number(product.shippingPrice) === 0 && (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-xl">
                  <Truck className="w-4 h-4" />
                  {t("free")} {t("shipping")}
                </div>
              )}
              {availableStock > 0 ? (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                  {t("inStock")}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-destructive bg-destructive/10 px-3 py-2 rounded-xl">
                  <Package className="w-4 h-4" />
                  {t("outOfStock")}
                </div>
              )}
            </div>
          </div>

          {/* Purchase card — right */}
          <div id="purchase" className="lg:col-span-1 scroll-mt-24">
            <Card className="rounded-3xl border-2 shadow-lg shadow-primary/5 lg:sticky lg:top-20">
              <CardContent className="p-5 space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-base">
                    <span className="text-muted-foreground">{t("price")}</span>
                    <ProductPrice value={parseFloat(product.price)} className="text-base font-bold" />
                  </div>
                  <div className="flex justify-between items-center text-base">
                    <span className="text-muted-foreground">{t("shipping")}</span>
                    {Number(product.shippingPrice) === 0 ? (
                      <span className="text-green-600 font-bold text-sm">{t("free")}</span>
                    ) : (
                      <ProductPrice value={parseFloat(product.shippingPrice)} className="text-base font-bold" />
                    )}
                  </div>
                  <div className="flex justify-between items-center text-base">
                    <span className="text-muted-foreground">{t("status")}</span>
                    {availableStock > 0 ? (
                      <span className="text-green-600 font-bold text-sm">{t("inStock")}</span>
                    ) : (
                      <span className="text-destructive font-bold text-sm">{t("outOfStock")}</span>
                    )}
                  </div>
                </div>

                <div className="border-t-2 pt-4">
                  {availableStock > 0 ? (
                    <AddToCart
                      cart={cart}
                      item={{
                        productId: product.id,
                        name: product.name,
                        slug: product.slug,
                        price: product.price,
                        costPrice: product.costPrice,
                        shippingPrice: product.shippingPrice,
                        offers: product.offers,
                        qty: 1,
                        image: product.images![0],
                      }}
                    />
                  ) : (
                    <div className="text-center py-3 text-destructive font-bold text-base">
                      {t("outOfStock")}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="mt-10 border-t-2 pt-8">
        <div className="flex items-center gap-3 mb-6">
          <Star className="w-6 h-6 text-yellow-500 fill-yellow-400" />
          <h2 className="text-xl sm:text-2xl font-extrabold">{t("customerReviews")}</h2>
        </div>
        <ReviewList
          userId={userId || ""}
          productId={product.id}
          productSlug={product.slug}
          initialReviews={reviews.data}
        />
      </section>
    </>
  );
};

export default ProductDetailsPage;
