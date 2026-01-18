import ProductForm from "@/components/admin/product-form";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getAllCategories } from "@/lib/actions/category.actions";

export const metadata: Metadata = {
  title: "Create Product",
};
const CreateProductPage = async () => {
  const t = await getTranslations('AdminProduct');
  const categories = await getAllCategories();
  return (
    <>
      <h2 className="h2-bold">{t('titleCreate')}</h2>
      <div className="my-8">
        <ProductForm type="Create" categories={categories} />
      </div>
    </>
  );
};

export default CreateProductPage;
