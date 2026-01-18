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

  const t = await getTranslations('SearchPage');

  const isQuerySet = q && q !== "all" && q.trim() !== "";
  const isCategorySet =
    category && category !== "all" && category.trim() !== "";
  const isPriceSet = price && price !== "all" && price.trim() !== "";
  const isRatingSet = rating && rating !== "all" && rating.trim() !== "";

  if (isQuerySet || isCategorySet || isPriceSet || isRatingSet) {
    return {
      title: `
      ${t('title')} ${isQuerySet ? q : ""} 
      ${isCategorySet ? `: ${t('category')} ${category}` : ""}
      ${isPriceSet ? `: ${t('price')} ${price}` : ""}
      ${isRatingSet ? `: ${t('rating')} ${rating}` : ""}`,
    };
  } else {
    return {
      title: t('title'),
    };
  }
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

  const t = await getTranslations('SearchPage');

  // Construct filter url
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

  /* prices and ratings are already defined at module level (ratings only now), need to pass them */
  const prices = [
    {
      name: `1,000 د.ع ${t('priceTo')} 50,000 د.ع`,
      value: "1-50",
    },
    {
      name: `51,000 د.ع ${t('priceTo')} 100,000 د.ع`,
      value: "51-100",
    },
    {
      name: `101,000 د.ع ${t('priceTo')} 200,000 د.ع`,
      value: "101-200",
    },
    {
      name: `201,000 د.ع ${t('priceTo')} 500,000 د.ع`,
      value: "201-500",
    },
    {
      name: `501,000 د.ع ${t('priceTo')} 1,000,000 د.ع`,
      value: "501-1000",
    },
  ];

  return (
    <div className="grid md:grid-cols-5 md:gap-5">
      <SearchFilters
        categories={categories}
        prices={prices}
        ratings={ratings}
        translations={{
          category: t('category'),
          price: t('price'),
          customerRatings: t('customerRatings'),
          any: t('any'),
          starsAndUp: t('starsAndUp'),
        }}
      />
      <div className="md:col-span-4 space-y-4">
        <div className="flex-between flex-col md:flex-row my-4">
          <div className="flex items-center gap-2">
            {q !== "all" && q !== "" && (
              <span className="bg-gray-100 p-1 px-2 rounded-md">
                {t('query')}: {q}
              </span>
            )}
            {category !== "all" && category !== "" && (
              <span className="bg-gray-100 p-1 px-2 rounded-md">
                {t('category')}: {category}
              </span>
            )}
            {price !== "all" && (
              <span className="bg-gray-100 p-1 px-2 rounded-md">
                {t('price')}: {price}
              </span>
            )}
            {rating !== "all" && (
              <span className="bg-gray-100 p-1 px-2 rounded-md">
                {t('customerRatings')}: {rating} {t('starsAndUp')}
              </span>
            )}

            {(q !== "all" && q !== "") ||
              (category !== "all" && category !== "") ||
              rating !== "all" ||
              price !== "all" ? (
              <Button variant={"link"} asChild>
                <Link href="/search">{t('clear')}</Link>
              </Button>
            ) : null}
          </div>
          <div>
            {t('sortBy')}{" "}
            {sortOrders.map((s) => (
              <Link
                key={s}
                className={`mx-2 ${sort == s && "font-bold"}`}
                href={getFilterUrl({ s })}
              >
                {t(s as any)}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {products.data.length === 0 && <div>{t('noResults')}</div>}
          {products.data.map((product: Product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
