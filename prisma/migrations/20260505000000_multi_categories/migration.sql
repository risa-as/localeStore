-- Multi-categories migration: convert single category string to categories array

-- Step 1: Add new categories column
ALTER TABLE "Product" ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT '{}';

-- Step 2: Migrate existing data - wrap single category string into array
UPDATE "Product" SET "categories" = ARRAY["category"];

-- Step 3: Drop old category column
ALTER TABLE "Product" DROP COLUMN "category";
