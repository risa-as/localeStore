"use client";

import { useToast } from "@/hooks/use-toast";
import { insertCategorySchema } from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCategory } from "@/lib/actions/category.actions";
import slugify from "slugify";

const CategoryForm = () => {
    const router = useRouter();
    const { toast } = useToast();

    const form = useForm<z.infer<typeof insertCategorySchema>>({
        resolver: zodResolver(insertCategorySchema),
        defaultValues: {
            name: "",
            slug: "",
        },
    });

    async function onSubmit(values: z.infer<typeof insertCategorySchema>) {
        const res = await createCategory(values);

        if (!res.success) {
            toast({
                variant: "destructive",
                description: res.message,
            });
        } else {
            toast({
                description: res.message,
            });
            router.push("/admin/categories");
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-lg">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input placeholder="Category Name" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Slug</FormLabel>
                            <FormControl>
                                <div className="relative">
                                    <Input placeholder="Category Slug" {...field} />
                                    <Button
                                        type="button"
                                        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 mt-2"
                                        onClick={() => {
                                            form.setValue(
                                                "slug",
                                                slugify(form.getValues("name"), { lower: true })
                                            );
                                        }}
                                    >
                                        Generate
                                    </Button>
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Submitting..." : "Create Category"}
                </Button>
            </form>
        </Form>
    );
};

export default CategoryForm;
