import ProductForm from "@/components/admin/product-form";
import { getProductById } from "@/lib/actions/product.actions";
import { getAllCategories } from "@/lib/actions/category.actions";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Update Product",
};
const AdminProductUpdatePage = async (props: {
  params: Promise<{
    id: string;
  }>;
}) => {
  const { id } = await props.params;
  const product = await getProductById(id);
  const categories = await getAllCategories();
  const t = await getTranslations('AdminProduct');
  if (!product) return notFound();
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <h1 className="h2-bold">{t('titleUpdate')}</h1>
      <ProductForm type="Update" product={product} productId={id} categories={categories} />
    </div>
  );
};

export default AdminProductUpdatePage;
