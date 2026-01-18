
import 'dotenv/config';
import { getProductBySlug } from "@/lib/actions/product.actions";
import { prisma } from "@/db/prisma";

async function main() {
    console.log("Checking product serialization...");
    try {
        // Get a known slug or just the first product
        const firstProduct = await prisma.product.findFirst();
        if (!firstProduct) {
            console.log("No products in DB to check.");
            return;
        }

        console.log(`Checking slug: ${firstProduct.slug}`);
        const product = await getProductBySlug(firstProduct.slug);

        if (product) {
            console.log("Product retrieved.");
            console.log("Type of price:", typeof product.price);
            console.log("Value of price:", product.price);

            // Check if it looks like a plain object (not a Prisma Decimal)
            // A Decimal object usually has s, e, d properties or is an object.
            // Our converter should make it a string (if using the adapter extension logic) OR just a plain number/string depending on conversion.
            // But the error was about passing it to client component. 
            // convertToPlainObject does JSON parse/stringify.
            // So 'price' should be a string (because of the Prisma extension in db/prisma.ts) 
            // OR it might remain a string if the extension did its job.

            // Actually, the serialization error comes from `Decimal` objects surviving.
            // If it's a plain string, we are good.
            if (typeof product.price === 'string') {
                console.log("SUCCESS: Price is a string (serialized).");
            } else if (typeof product.price === 'number') {
                console.log("SUCCESS: Price is a number (serialized).");
            } else {
                console.log("FAILURE: Price is likely an object/Decimal:", product.price);
            }
        } else {
            console.error("getProductBySlug returned null.");
        }

    } catch (error) {
        console.error("Error checking product:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
