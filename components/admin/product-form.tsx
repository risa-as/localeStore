"use client";
import { useToast } from "@/hooks/use-toast";
import { productDefaultValues } from "@/lib/constants";
import { insertProductSchema, updateProductSchema } from "@/lib/validators";
import { Product } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  ControllerRenderProps,
  Resolver,
  SubmitHandler,
  useForm,
} from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import slugify from "slugify";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { createProduct, updateProduct } from "@/lib/actions/product.actions";
import { Card, CardContent } from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import Image from "next/image";
import { Checkbox } from "../ui/checkbox";
import { UploadButton } from "@/lib/uploadthing";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

type ProductFormValues =
  | z.infer<typeof insertProductSchema>
  | z.infer<typeof updateProductSchema>;

const ProductForm = ({
  product,
  productId,
  categories,
  type,
}: {
  type: "Create" | "Update";
  product?: Product;
  productId?: string;
  categories: { id: string; name: string }[];
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('AdminProduct');

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(
      type === "Update" ? updateProductSchema : insertProductSchema
    ) as Resolver<ProductFormValues>,
    defaultValues:
      product && type === "Update" ? product : productDefaultValues,
  });
  const onSubmit: SubmitHandler<ProductFormValues> = async (values) => {
    // On Create Product
    if (type === "Create") {
      const res = await createProduct(values);
      if (!res.success) {
        toast({
          variant: "destructive",
          description: res.message,
        });
      } else {
        toast({
          description: res.message,
        });
        router.push("/admin/products");
      }
    }
    // On Update Product
    if (type === "Update") {
      if (!productId) {
        router.push("/admin/products");
        return;
      }
      const res = await updateProduct({ ...values, id: productId });
      if (!res.success) {
        toast({
          variant: "destructive",
          description: res.message,
        });
      } else {
        toast({
          description: res.message,
        });
        router.push("/admin/products");
      }
    }
  };
  const images = form.watch("images");
  const isFeatured = form.watch("isFeatured");
  const banner = form.watch("banner");

  return (
    <Form {...form}>
      <form
        method="POST"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-8"
      >
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row gap-5"></div>
          <div className="flex flex-col md:flex-row gap-5">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "name"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('placeholderName')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Slug */}
            <FormField
              control={form.control}
              name="slug"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "slug"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('slug')}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input placeholder={t('placeholderSlug')} {...field} />
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
                        {t('buttonGenerate')}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex flex-col md:flex-row gap-5">
            {/* Cate */}
            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('category')}</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('placeholderCategory')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.name}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Colors */}
            <FormField
              control={form.control}
              name="colors"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "colors"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('colors')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('placeholderColors')}
                      value={field.value?.length > 0 ? field.value.join(", ") : ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value.split(",").map((c) => c.trim())
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Offers */}
            <FormField
              control={form.control}
              name="offers"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "offers"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('offers')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('placeholderOffers')} {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex flex-col md:flex-row gap-5">
            {/* Price */}
            <FormField
              control={form.control}
              name="price"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "price"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('price')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('placeholderPrice')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Cost Price */}
            <FormField
              control={form.control}
              name="costPrice"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "costPrice"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('costPrice')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('placeholderPrice')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Shipping Price */}
            <FormField
              control={form.control}
              name="shippingPrice"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "shippingPrice"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('shippingPrice')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('placeholderShippingPrice')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Stock */}
            <FormField
              control={form.control}
              name="stock"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "stock"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('stock')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('placeholderStock')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="upload-field flex flex-col md:flex-row gap-5">
            {/* Image */}
            <FormField
              control={form.control}
              name="images"
              render={() => (
                <FormItem className="w-full">
                  <FormLabel>{t('images')}</FormLabel>
                  <Card>
                    <CardContent className="space-y-2 mt-2 min-h-48">
                      <div className="flex-start space-x-2">
                        {images.map((image: string) => (
                          <div key={image} className="relative w-20 h-20">
                            <Image
                              src={image}
                              alt="product image"
                              className="w-full h-full object-cover object-center rounded-sm"
                              width={100}
                              height={100}
                            />
                            <Button
                              type="button"
                              className="absolute top-0 right-0 p-1 h-6 w-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white"
                              onClick={() => {
                                form.setValue(
                                  "images",
                                  images.filter((img) => img !== image)
                                );
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <FormControl>
                          <UploadButton
                            endpoint="imageUploader"
                            onClientUploadComplete={(
                              res: { url: string }[]
                            ) => {
                              const newUrls = res.map((r) => r.url);
                              form.setValue("images", [...images, ...newUrls]);
                            }}
                            onUploadError={(error: Error) => {
                              toast({
                                variant: "destructive",
                                description: `ERROR! ${error.message}`,
                              });
                            }}
                          />
                        </FormControl>
                      </div>
                    </CardContent>
                  </Card>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="upload-field">
            {/* Featured */}
            {t('featuredProduct')}
            <Card>
              <CardContent className="space-y-2 mt-2">
                <FormField
                  control={form.control}
                  name="isFeatured"
                  render={({ field }) => (
                    <FormItem className="space-x-2 items-center">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>{t('isFeatured')}</FormLabel>
                    </FormItem>
                  )}
                />
                {isFeatured && banner && (
                  <Image
                    src={banner}
                    alt="Banner Image"
                    className="w-full object-cover object-center rounded-sm"
                    width={1920}
                    height={680}
                  />
                )}
                {isFeatured && !banner && (
                  <UploadButton
                    endpoint={"imageUploader"}
                    onClientUploadComplete={(res: { url: string }[]) => {
                      form.setValue("banner", res[0].url);
                    }}
                    onUploadError={(error: Error) => {
                      toast({
                        variant: "destructive",
                        description: `ERROR! ${error.message}`,
                      });
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
          <div>
            <FormField
              control={form.control}
              name="description"
              render={({
                field,
              }: {
                field: ControllerRenderProps<
                  z.infer<typeof insertProductSchema>,
                  "description"
                >;
              }) => (
                <FormItem className="w-full">
                  <FormLabel>{t('description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder={t('placeholderDescription')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div>
            <Button
              type="submit"
              size="lg"
              disabled={form.formState.isSubmitting}
              className="w-full button col-span-2"
            >
              {form.formState.isSubmitting
                ? t('buttonSubmitting')
                : type === "Create"
                  ? t('buttonCreate')
                  : t('buttonUpdate')}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};
export default ProductForm;
