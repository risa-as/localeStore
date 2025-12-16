import {z} from "zod";
import { formatNumberWithDecimal } from "./utils";
const currency = z
        .string()
        .refine(
            (val) => /^\d+(\.\d{1,2})?$/.test(formatNumberWithDecimal(Number(val))), 
            "Price must be a valid number with up to two decimal places")
// Schema for validating product insertion data
export const insertProductSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters long"),
    slug: z.string().min(3, "Slug must be at least 3 characters long"),
    category: z.string().min(3, "Category must be at least 3 characters long"),
    brand: z.string().min(3, "Brand must be at least 3 characters long"),
    description: z.string().min(3, "Description must be at least 3 characters long"),
    stock: z.coerce.number().min(0, "Stock must be a non-negative number"),
    images: z.array(z.string()).min(1, "At least one image is required"),
    isFeatured: z.boolean(),
    banner: z.string().nullable(),
    price: currency

})

// Schema For Signing Users In
export const signInFormSchema = z.object({
    email: z.string().email("Invalie Email Address"),
    password: z.string().min(6, "Password Must Be At Least 6 Characters")
})
// Schema For Signing Up a Users 
export const signUpFormSchema = z.object({
    name: z.string().min(3,"Name must be at least 3 characters"),
    email: z.string().email("Invalie Email Address"),
    password: z.string().min(6, "Password Must Be At Least 6 Characters"),
    confirmPassword: z.string().min(6, "Confirm Password Must Be At Least 6 Characters")
}).refine((data) => data.password === data.confirmPassword , {
    message: "Password don't match",
    path: ["confirmPassword"],
})

// Cart Schemas
export const cartItemSchema = z.object({
    productId: z.string().min(1, "Product is required"),
    name: z.string().min(1, "Name is required"),
    slug: z.string().min(1, "Slug is required"),
    qty: z.number().int().nonnegative("Quantity must to be a positive number"),
    image: z.string().min(1, "Image is required"),
    price: currency,
})

export const insertCartSchema = z.object({
    items: z.array(cartItemSchema),
    itemsPrice: currency,
    totalPrice: currency,
    shippingPrice: currency,
    taxPrice: currency,
    sessionCartId: z.string().min(1, "Session cart id is required"),
    userId: z.string().optional().nullable()
})