import CategoryForm from "./category-form";
import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "إضافة تصنيف" };

const CreateCategoryPage = () => {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/categories">
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
        <div className="p-2 rounded-lg bg-primary/10">
          <Tag className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إضافة تصنيف جديد</h1>
          <p className="text-sm text-muted-foreground">أضف تصنيفاً جديداً للمنتجات</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <p className="text-sm font-medium">بيانات التصنيف</p>
        </div>
        <div className="p-6">
          <CategoryForm />
        </div>
      </div>
    </div>
  );
};

export default CreateCategoryPage;
