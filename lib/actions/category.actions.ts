"use server";

import { revalidatePath } from "next/cache";
import { insertCategorySchema } from "../validators";
import { formatError } from "../utils";
import { prisma } from "@/db/prisma";
import { z } from "zod";

import { Category } from "@/types";

// Create a new category
export async function createCategory(data: z.infer<typeof insertCategorySchema>) {
    try {
        const category = insertCategorySchema.parse(data);
        await prisma.category.create({ data: category });
        revalidatePath("/admin/categories");
        return { success: true, message: "Category created successfully" };
    } catch (error) {
        const { formError } = formatError(error);
        return { success: false, message: formError };
    }
}

// Get all categories
export async function getAllCategories() {
    if (!prisma.category) {
        console.error("Prisma Category model is missing. Please restart your server.");
        // Return empty array to avoid crash, but this implies system is broken
        return [] as Category[];
    }
    const data = await prisma.category.findMany({
        orderBy: { createdAt: "desc" },
    });
    return data as Category[];
}

// Delete a category
export async function deleteCategory(id: string) {
    try {
        await prisma.category.delete({
            where: { id },
        });
        revalidatePath("/admin/categories");
        return { success: true, message: "Category deleted successfully" };
    } catch (error) {
        const { formError } = formatError(error);
        return { success: false, message: formError };
    }
}
