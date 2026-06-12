import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { getAllCategories } from "@/lib/actions/category.actions";
import { requireAdmin } from "@/lib/auth-guard";
import { formatDateTime } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import DeleteCategoryButton from "./delete-category-button";
import { Tag, Plus } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("categories") };
}

const AdminCategoriesPage = async () => {
  await requireAdmin();
  const categories = await getAllCategories();
  const t = await getTranslations("Categories");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Tag className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {categories.length} {t("title")}
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/categories/create" className="gap-2">
            <Plus className="w-4 h-4" />
            {t("create")}
          </Link>
        </Button>
      </div>

      {/* Table */}
      {categories.length === 0 ? (
        <div className="rounded-xl border bg-muted/20 flex flex-col items-center justify-center py-20 gap-3">
          <Tag className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">{t("noCategories")}</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/categories/create">{t("create")}</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold w-12">#</TableHead>
                <TableHead className="font-semibold">{t("name")}</TableHead>
                <TableHead className="font-semibold">{t("slug")}</TableHead>
                <TableHead className="font-semibold">{t("createdAt")}</TableHead>
                <TableHead className="text-center font-semibold w-[100px]">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category, index) => (
                <TableRow key={category.id} className="hover:bg-muted/30">
                  <TableCell className="text-muted-foreground text-sm">{index + 1}</TableCell>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {category.slug}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(category.createdAt).dateTime}
                  </TableCell>
                  <TableCell className="text-center">
                    <DeleteCategoryButton id={category.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default AdminCategoriesPage;
