import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getAllCategories, deleteCategory } from "@/lib/actions/category.actions";
import { requireAdmin } from "@/lib/auth-guard";
import { formatDateTime, formatId } from "@/lib/utils";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import DeleteCategoryButton from "./delete-category-button";
// import DeleteDialog from "@/components/shared/delete-dialog";
// We'll implement a simple delete button for now, or reuse a delete dialog if available.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Admin" });

    return {
        title: t("categories"),
    };
}

const AdminCategoriesPage = async () => {
    await requireAdmin();
    const categories = await getAllCategories();
    const t = await getTranslations("Categories");
    const tAdmin = await getTranslations("Admin");

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <h1 className="h2-bold">{t('title')}</h1>
                <Button asChild variant="default">
                    <Link href="/admin/categories/create">{t('create')}</Link>
                </Button>
            </div>
            <div className="overflow-x-auto">
                {categories.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-muted-foreground">{t('noCategories')}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('restartServer')}</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{tAdmin('id')}</TableHead>
                                <TableHead>{t('name')}</TableHead>
                                <TableHead>{t('slug')}</TableHead>
                                <TableHead>{t('createdAt')}</TableHead>
                                <TableHead className="w-[100px]">{t('actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {categories.map((category) => (
                                <TableRow key={category.id}>
                                    <TableCell>{formatId(category.id)}</TableCell>
                                    <TableCell>{category.name}</TableCell>
                                    <TableCell>{category.slug}</TableCell>
                                    <TableCell>
                                        {formatDateTime(category.createdAt).dateTime}
                                    </TableCell>
                                    <TableCell>
                                        {/* Action buttons */}
                                        <DeleteCategoryButton id={category.id} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
};

export default AdminCategoriesPage;
