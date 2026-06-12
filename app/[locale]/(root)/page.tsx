export const revalidate = 3600;

import type { Metadata } from "next";
export const metadata: Metadata = { title: "الرئيسية" };

import DealCountdown from "@/components/deal-countdown";
import IconBoxes from "@/components/icon-boxes";
import ProductCarousel from "@/components/shared/product/product-carousel.";
import ProductList from "@/components/shared/product/product-list";
import ViewAllProductsButton from "@/components/view-all-products-button";
import CategoryRow from "@/components/home/category-row";
import {
  getFeaturedProducts,
  getLatestProducts,
} from "@/lib/actions/product.actions";
import { LATEST_PRODUCTS_LIMIT } from "@/lib/constants";
import { getTranslations } from "next-intl/server";

const HomePage = async () => {
  const latestProducts = await getLatestProducts();
  const featuredProducts = await getFeaturedProducts();
  const t = await getTranslations("Product");

  return (
    <>
      {featuredProducts.length > 0 && (
        <ProductCarousel data={featuredProducts} />
      )}
      <CategoryRow />
      <ProductList
        data={latestProducts}
        title={t("title")}
        limit={LATEST_PRODUCTS_LIMIT}
      />
      <ViewAllProductsButton />
      <DealCountdown />
      <IconBoxes />
    </>
  );
};

export default HomePage;
