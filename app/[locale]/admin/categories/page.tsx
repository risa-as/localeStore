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
import Link from "next/link";
import DeleteCategoryButton from "./delete-category-button";
// import DeleteDialog from "@/components/shared/delete-dialog";
// We'll implement a simple delete button for now, or reuse a delete dialog if available.

export const metadata: Metadata = {
    title: "Admin Categories",
};

const AdminCategoriesPage = async () => {
    await requireAdmin();
    const categories = await getAllCategories();

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <h1 className="h2-bold">Categories</h1>
                <Button asChild variant="default">
                    <Link href="/admin/categories/create">Create Category</Link>
                </Button>
            </div>
            <div className="overflow-x-auto">
                {categories.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-muted-foreground">No categories found.</p>
                        <p className="text-xs text-muted-foreground mt-1">If you just added the schema, please restart your server.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Slug</TableHead>
                                <TableHead>Created At</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
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
