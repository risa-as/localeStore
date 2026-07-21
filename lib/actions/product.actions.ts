"use server";
import { prisma } from "@/db/prisma";
import { convertToPlainObject, formatError } from "../utils";
import { LATEST_PRODUCTS_LIMIT, PAGE_SIZE } from "../constants";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { insertProductSchema, updateProductSchema } from "../validators";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// Get latest products
export const getLatestProducts = unstable_cache(
  async () => {
    const data = await prisma.product.findMany({
      take: LATEST_PRODUCTS_LIMIT,
      orderBy: { createdAt: "desc" },
    });
    return convertToPlainObject(data) as any;
  },
  ["latest-products"],
  { revalidate: 3600, tags: ["products"] }
);

// Get single product by it's slug
export const getProductBySlug = unstable_cache(
  async (slug: string) => {
    const data = await prisma.product.findFirst({
      where: { slug },
    });
    return convertToPlainObject(data) as any;
  },
  ["product-by-slug"],
  { revalidate: 3600, tags: ["products"] }
);

// Get single product by it's ID
export async function getProductById(productId: string) {
  const data = await prisma.product.findFirst({
    where: { id: productId },
  });

  return convertToPlainObject(data) as any;
}

// Get all products
export async function getAllProducts({
  query,
  limit = PAGE_SIZE,
  page,
  category,
  price,
  rating,
  sort,
}: {
  query: string;
  limit?: number;
  page: number;
  category?: string;
  price?: string;
  rating?: string;
  sort?: string;
}) {
  // Query filter
  const queryFilter: Prisma.ProductWhereInput =
    query && query !== "all"
      ? {
        name: {
          contains: query,
          mode: "insensitive",
        } as Prisma.StringFilter,
      }
      : {};

  // Category filter
  const categoryFilter =
    category && category !== "all"
      ? { categories: { has: category } }
      : {};

  // Price filter
  const priceFilter: Prisma.ProductWhereInput =
    price && price !== "all"
      ? {
        price: {
          gte: Number(price.split("-")[0]),
          lte: Number(price.split("-")[1]),
        },
      }
      : {};

  // Rating filter
  const ratingFilter =
    rating && rating !== "all"
      ? {
        rating: {
          gte: Number(rating),
        },
      }
      : {};

  const data = await prisma.product.findMany({
    where: {
      ...queryFilter,
      ...categoryFilter,
      ...priceFilter,
      ...ratingFilter,
    },
    orderBy:
      sort === "lowest"
        ? { price: "asc" }
        : sort === "highest"
          ? { price: "desc" }
          : sort === "rating"
            ? { rating: "desc" }
            : { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  const dataCount = await prisma.product.count();

  return {
    data: convertToPlainObject(data) as any,
    totalPages: Math.ceil(dataCount / limit),
  };
}

// Delete a product
export async function deleteProduct(id: string) {
  try {
    const productExists = await prisma.product.findFirst({
      where: { id },
    });

    if (!productExists) throw new Error("Product not found");

    await prisma.product.delete({ where: { id } });

    revalidatePath("/admin/products");
    revalidateTag("products", {});

    return {
      success: true,
      message: "Product deleted successfully",
    };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

// Create a product
export async function createProduct(data: z.infer<typeof insertProductSchema>) {
  try {
    const product = insertProductSchema.parse(data);

    // Create the product AND its opening batch in one transaction, so the
    // quantity entered here shows up on /admin/batches and feeds the FEFO cost
    // engine. Without the batch the product is invisible to the batches page and
    // its sales silently fall back to the frozen snapshot cost.
    //
    // The batch quantity is the raw stock (not `stock − sold`): a brand-new
    // product has no sales yet, so the two are equal. This keeps the invariant
    // `Product.stock == SUM(batch.quantity)` true from creation onwards.
    await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: product });

      if (created.stock > 0) {
        await tx.productBatch.create({
          data: {
            productId: created.id,
            batchNumber: "1",
            quantity: created.stock,
            costPrice: created.costPrice,
            notes: "دفعة افتتاحية أُنشئت تلقائياً عند إضافة المنتج",
          },
        });
      }
    });

    revalidatePath("/admin/products");
    revalidatePath("/admin/batches");
    revalidatePath("/admin/profit");
    revalidateTag("products", {});

    return {
      success: true,
      message: "Product created successfully",
    };
  } catch (error) {
    console.error("CREATE PRODUCT ERROR:", error);
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

// Update a product
export async function updateProduct(data: z.infer<typeof updateProductSchema>) {
  try {
    const product = updateProductSchema.parse(data);
    const productExists = await prisma.product.findFirst({
      where: { id: product.id },
    });

    if (!productExists) throw new Error("Product not found");

    // Batches own the stock number. Editing `stock` directly here would break the
    // invariant `Product.stock == SUM(batch.quantity)` and silently desync the
    // products page from the batches page — which is exactly the drift this fix
    // removes. So we drop the incoming `stock` and keep the stored value;
    // inventory changes go through /admin/batches (add / edit / delete a batch),
    // which updates both sides atomically.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stock: _ignoredStock, ...productWithoutStock } = product;

    await prisma.product.update({
      where: { id: product.id },
      data: productWithoutStock,
    });

    revalidatePath("/admin/products");
    revalidatePath("/admin/batches");
    revalidateTag("products", {});

    return {
      success: true,
      message: "Product updated successfully",
    };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

// Get all categories with counts (from product categories arrays)
export async function getAllCategories() {
  const data = await prisma.$queryRaw<{ category: string; _count: number }[]>`
    SELECT category_name AS category, COUNT(*)::int AS "_count"
    FROM "Product", unnest(categories) AS category_name
    GROUP BY category_name
    ORDER BY COUNT(*) DESC
  `;
  return data;
}

// Get featured products
export const getFeaturedProducts = unstable_cache(
  async () => {
    const data = await prisma.product.findMany({
      where: { isFeatured: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    });
    return convertToPlainObject(data) as any;
  },
  ["featured-products"],
  { revalidate: 1800, tags: ["products"] }
);
