import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth-guard";
import { getCategoryById } from "@/lib/actions/category.actions";
import { Button } from "@/components/ui/button";
import CategoryForm from "../create/category-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Categories" });
  return { title: t("editTitle") };
}

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  await requireAdmin();
  const { id, locale } = await params;
  const category = await getCategoryById(id);
  if (!category) notFound();
  const t = await getTranslations("Categories");
  return (
    <div className="mx-auto max-w-2xl space-y-6 [&_button]:rounded-[10px] [&_input]:rounded-[10px] [&_a]:rounded-[10px]">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/${locale}/admin/categories`} aria-label={t("back")}><ArrowRight className="h-4 w-4" /></Link>
        </Button>
        <div className="rounded-[10px] bg-primary/10 p-2"><Pencil className="h-5 w-5 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-bold">{t("editTitle")}</h1>
          <p className="text-sm text-muted-foreground">{category.name}</p>
        </div>
      </header>
      <section className="overflow-hidden rounded-[10px] border bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-6 py-4"><p className="text-sm text-muted-foreground">{t("editDescription")}</p></div>
        <div className="p-6"><CategoryForm category={{ id: category.id, name: category.name, slug: category.slug }} /></div>
      </section>
    </div>
  );
}
