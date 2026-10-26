"use server";
import { requireStaff } from "@/lib/authorization";

import { revalidatePath, revalidateTag } from "next/cache";
import { insertCategorySchema } from "../validators";
import { formatError } from "../utils";
import { prisma } from "@/db/prisma";
import { z } from "zod";

import { Category } from "@/types";

const updateCategorySchema = insertCategorySchema.extend({ id: z.string().uuid() });

export async function getCategoryById(id: string) {
    await requireStaff();
    if (!z.string().uuid().safeParse(id).success) return null;
    return prisma.category.findUnique({ where: { id } });
}

export async function updateCategory(data: z.infer<typeof updateCategorySchema>) {
    await requireStaff();
    try {
        const { id, ...category } = updateCategorySchema.parse(data);
        await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${id}::uuid FOR UPDATE`;
            const existing = await tx.category.findUniqueOrThrow({ where: { id } });
            await tx.category.update({ where: { id }, data: category });
            if (existing.name !== category.name) {
                // Work on each row's current array, retaining other categories and their order.
                await tx.$executeRaw`
                    UPDATE "Product"
                    SET categories = ARRAY(
                        SELECT entry.value
                        FROM unnest(array_replace(categories, ${existing.name}, ${category.name}))
                            WITH ORDINALITY AS entry(value, ordinal)
                        GROUP BY entry.value ORDER BY min(entry.ordinal)
                    )
                    WHERE ${existing.name} = ANY(categories)
                `;
            }
        });
        revalidateTag("categories", {});
        revalidateTag("products", {});
        revalidatePath("/[locale]/admin/categories", "page");
        revalidatePath("/[locale]/admin/categories/[id]", "page");
        revalidatePath("/[locale]/admin/products", "page");
        revalidatePath("/[locale]/admin/products/create", "page");
        revalidatePath("/[locale]/admin/products/[id]", "page");
        revalidatePath("/[locale]/search", "page");
        return { success: true, message: "تم تحديث الفئة بنجاح" };
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
            return { success: false, message: "اسم الفئة أو الرابط المختصر مستخدم بالفعل" };
        }
        if (error instanceof z.ZodError) {
            return { success: false, message: error.issues.map(issue => issue.message).join("، ") };
        }
        const { formError } = formatError(error);
        return { success: false, message: formError };
    }
}

// Create a new category
export async function createCategory(data: z.infer<typeof insertCategorySchema>) {
  await requireStaff();
    try {
        const category = insertCategorySchema.parse(data);
        await prisma.category.create({ data: category });
        revalidatePath("/admin/categories");
        revalidatePath("/admin/products/create");
        revalidateTag("categories", {});
        return { success: true, message: "Category created successfully" };
    } catch (error) {
        const { formError } = formatError(error);
        return { success: false, message: formError };
    }
}

// Get all categories
export async function getAllCategories() {
    const data = await prisma.category.findMany({
        orderBy: { createdAt: "desc" },
    });
    return data as Category[];
}

// Delete a category
export async function deleteCategory(id: string) {
  await requireStaff();
    try {
        await prisma.$transaction(async (tx) => {
            const category = await tx.category.findUniqueOrThrow({ where: { id } });
            const products = await tx.product.findMany({ where: { categories: { has: category.name } }, select: { id: true, categories: true } });
            for (const product of products) {
                await tx.product.update({ where: { id: product.id }, data: { categories: product.categories.filter(name => name !== category.name) } });
            }
            await tx.category.delete({ where: { id } });
        });
        revalidateTag("products", {});
        revalidatePath("/admin/categories");
        revalidatePath("/admin/products/create");
        revalidateTag("categories", {});
        return { success: true, message: "Category deleted successfully" };
    } catch (error) {
        const { formError } = formatError(error);
        return { success: false, message: formError };
    }
}
