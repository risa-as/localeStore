import ProductForm from "@/components/admin/product-form";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getAllCategories } from "@/lib/actions/category.actions";
import Link from "next/link";
import { ArrowRight, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "إضافة منتج" };

const CreateProductPage = async () => {
  const t = await getTranslations("AdminProduct");
  const categories = await getAllCategories();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/products"><ArrowRight className="w-4 h-4" /></Link>
        </Button>
        <div className="p-2 rounded-lg bg-primary/10">
          <PackagePlus className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("titleCreate")}</h1>
          <p className="text-sm text-muted-foreground">أضف منتجاً جديداً للمتجر</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <p className="text-sm font-medium">بيانات المنتج</p>
        </div>
        <div className="p-6">
          <ProductForm type="Create" categories={categories} />
        </div>
      </div>
    </div>
  );
};

export default CreateProductPage;
