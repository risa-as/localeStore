import ProductForm from "@/components/admin/product-form";
import { getProductById } from "@/lib/actions/product.actions";
import { getAllCategories } from "@/lib/actions/category.actions";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "تعديل المنتج" };

const AdminProductUpdatePage = async (props: { params: Promise<{ id: string }> }) => {
  const { id } = await props.params;
  const [product, categories] = await Promise.all([getProductById(id), getAllCategories()]);
  const t = await getTranslations("AdminProduct");
  if (!product) return notFound();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/products"><ArrowRight className="w-4 h-4" /></Link>
        </Button>
        <div className="p-2 rounded-lg bg-primary/10">
          <PackageSearch className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("titleUpdate")}</h1>
          <p className="text-sm text-muted-foreground">{product.name}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <p className="text-sm font-medium">بيانات المنتج</p>
        </div>
        <div className="p-6">
          <ProductForm type="Update" product={product} productId={id} categories={categories} />
        </div>
      </div>
    </div>
  );
};

export default AdminProductUpdatePage;
