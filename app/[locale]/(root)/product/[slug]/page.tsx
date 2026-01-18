import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getProductBySlug } from "@/lib/actions/product.actions";
import { notFound } from "next/navigation";
import ProductPrice from "@/components/shared/product/product-price";
import ProductImages from "@/components/shared/product/product-images";
import AddToCart from "@/components/shared/product/add-to-cart";
import { getMyCart } from "@/lib/actions/cart.actions";
import { auth } from "@/auth";
import ReviewList from "./review-list";
import Rating from "@/components/shared/product/rating";

const ProductDetailsPage = async (props: {
  params: Promise<{ slug: string }>;
}) => {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return notFound();
  }
  const session = await auth();
  const userId = session?.user?.id;
  const cart = await getMyCart();
  return (
    <>
      <section>
        <div className="grid grid-cols-1 md:grid-cols-5">
          {/* For Image */}
          <div className="col-span-2">
            <ProductImages images={product.images} />
          </div>
          {/* For Details */}
          <div className="col-span-2 p-5">
            <div className="flex flex-col gap-6">
              <p>
                {product.brand} {product.category}
              </p>
              <h1 className="h3-bold">{product.name}</h1>
              <Rating value={Number(product.rating)} />
              <p>{product.numReviews} reviews</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <ProductPrice
                  value={parseFloat(product.price)}
                  className="rounded-full bg-green-100 text-green-700 px-5 py-2 inline-flex items-center justify-center shadow-sm"
                />
              </div>
            </div>
            <div className="mt-10">
              <p className="font-semibold mb-3">Description</p>
              <p className="text-sm text-muted-foreground">
                {product.description}
              </p>
            </div>
          </div>
          {/* For Purchase Options */}
          <div>
            <Card>
              <CardContent className="p-4">
                <div className="mb-2 flex justify-between">
                  <div>Price</div>
                  <div>
                    <ProductPrice value={parseFloat(product.price)} />
                  </div>
                </div>
                <div className="mb-2 flex justify-between">
                  <div>Shipping</div>
                  <div>
                    {Number(product.shippingPrice) === 0 ? (
                      <Badge variant="secondary">Free</Badge>
                    ) : (
                      <ProductPrice value={parseFloat(product.shippingPrice)} />
                    )}
                  </div>
                </div>
                <div className="mb-2 flex justify-between">
                  <div>Status</div>
                  {product.stock > 0 ? (
                    <Badge variant="outline">In Stock</Badge>
                  ) : (
                    <Badge variant="destructive">Out of Stock</Badge>
                  )}
                </div>
                {product.stock > 0 && (
                  <AddToCart
                    cart={cart}
                    item={{
                      productId: product.id,
                      name: product.name,
                      slug: product.slug,
                      price: product.price,
                      shippingPrice: product.shippingPrice,
                      qty: 1,
                      image: product.images![0],
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      <section className="mt-10">
        <h2 className="h2-bold">Customer Reviews</h2>
        <ReviewList
          userId={userId || ""}
          productId={product.id}
          productSlug={product.slug}
        />
      </section>
    </>
  );
};

export default ProductDetailsPage;
