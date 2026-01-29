import { Product } from "@/types";
import ProductCard from "./product-card";
import { useTranslations } from "next-intl";

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
    const t = useTranslations('Product');

    return (
        <div className="my-10">
            <h2 className="h2-bold mb-4">{t("title")}</h2>
            {limitedData.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {limitedData.map((product: Product, index: number) => (
                        <ProductCard key={product.id} product={product} priority={index < 4} />
                    ))}
                </div>
            ) : (
                <div>
                    <p>{t('noProducts')}</p>
                </div>
            )}
        </div>
    );
};

export default ProductList;