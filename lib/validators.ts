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