import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { getAllCategories } from "@/lib/actions/product.actions";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

const CategoryDrawer = async () => {
  const categories = await getAllCategories();
  const t = await getTranslations("Categories");
  const tSearch = await getTranslations("Search");

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label={t("selectCategory")}>
          <LayoutGrid className="w-5 h-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-[85vh] max-w-sm mx-auto">
        <DrawerHeader className="border-b pb-4">
          <DrawerTitle className="text-xl font-bold">{t("selectCategory")}</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-1 overflow-y-auto">
          <DrawerClose asChild>
            <Link
              href="/search"
              className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-base font-semibold hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <span>{tSearch("all")}</span>
              <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {categories.reduce((a, c) => a + c._count, 0)}
              </span>
            </Link>
          </DrawerClose>
          {categories.map((category) => (
            <DrawerClose key={category.category} asChild>
              <Link
                href={`/search?category=${category.category}`}
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-base hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <span>{category.category}</span>
                <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {category._count}
                </span>
              </Link>
            </DrawerClose>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default CategoryDrawer;
