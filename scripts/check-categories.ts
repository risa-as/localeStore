
import 'dotenv/config';
import { createCategory, getAllCategories, deleteCategory } from "@/lib/actions/category.actions";
import { prisma } from "@/db/prisma";

async function main() {
    console.log("Checking category actions...");
    try {
        // 1. Create
        const newCategory = {
            name: "Test Category",
            slug: "test-category"
        };
        console.log("Creating category:", newCategory);
        const createRes = await createCategory(newCategory);
        console.log("Create Result:", createRes);

        if (!createRes.success) throw new Error("Failed to create category");

        // 2. List
        console.log("Fetching categories...");
        const categories = await getAllCategories();
        console.log(`Found ${categories.length} categories.`);

        const createdCat = categories.find(c => c.slug === "test-category");
        if (createdCat) {
            console.log("Found created category:", createdCat);

            // 3. Delete
            console.log("Deleting category:", createdCat.id);
            const deleteRes = await deleteCategory(createdCat.id);
            console.log("Delete Result:", deleteRes);
        } else {
            console.error("Created category not found in list!");
        }

    } catch (error) {
        console.error("Error checking categories:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
