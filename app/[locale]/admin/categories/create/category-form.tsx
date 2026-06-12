"use client";

import { useToast } from "@/hooks/use-toast";
import { insertCategorySchema } from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCategory } from "@/lib/actions/category.actions";
import slugify from "slugify";
import { useTranslations } from "next-intl";
import { Loader2, Wand2 } from "lucide-react";

const CategoryForm = () => {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("Categories");

  const form = useForm<z.infer<typeof insertCategorySchema>>({
    resolver: zodResolver(insertCategorySchema),
    defaultValues: { name: "", slug: "" },
  });

  async function onSubmit(values: z.infer<typeof insertCategorySchema>) {
    const res = await createCategory(values);
    if (!res.success) {
      toast({ variant: "destructive", description: res.message });
    } else {
      toast({ description: res.message });
      router.push("/admin/categories");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name")}</FormLabel>
              <FormControl>
                <Input placeholder={t("placeholderName")} {...field} />
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
              <FormLabel>{t("slug")}</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <Input placeholder={t("placeholderSlug")} {...field} />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() =>
                      form.setValue("slug", slugify(form.getValues("name"), { lower: true }))
                    }
                  >
                    <Wand2 className="w-4 h-4" />
                    {t("generate")}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting} className="min-w-[120px]">
            {form.formState.isSubmitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("submitting")}</>
              : t("create")}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CategoryForm;
