
import dotenv from "dotenv";
dotenv.config();
import { prisma } from "../db/prisma";

async function main() {
    console.log("Checking Prisma Client...");
    try {
        if (!prisma.category) {
            console.error("❌ prisma.category is undefined!");
            process.exit(1);
        }
        console.log("✅ prisma.category exists.");
        const categories = await prisma.category.findMany();
        console.log(`✅ Successfully fetched ${categories.length} categories.`);
    } catch (e) {
        console.error("❌ Error:", e);
        process.exit(1);
    }
}

main();
