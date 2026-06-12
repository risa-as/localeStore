import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllCategories } from "@/lib/actions/product.actions";
import { SearchIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

const Search = async () => {
  const categories = await getAllCategories();
  const t = await getTranslations("Search");

  return (
    <form action="/search" method="GET" className="w-full">
      <div className="flex w-full items-center rounded-2xl border-2 border-border bg-background overflow-hidden focus-within:border-primary transition-colors shadow-sm">
        <Select name="category">
          <SelectTrigger className="w-[90px] sm:w-[120px] border-0 border-e rounded-none bg-muted/60 shrink-0 h-11 text-sm font-medium focus:ring-0 focus:outline-none">
            <SelectValue placeholder={t("all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            {categories?.map((x) => (
              <SelectItem key={x.category} value={x.category}>
                {x.category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          name="q"
          type="text"
          placeholder={t("placeholder")}
          className="flex-1 min-w-0 border-0 rounded-none h-11 focus-visible:ring-0 bg-transparent px-3 text-base placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          className="rounded-none rounded-e-2xl h-11 px-4 sm:px-5 shrink-0 bg-primary hover:bg-primary/90 text-white font-bold gap-1.5"
          aria-label={t("search")}
        >
          <SearchIcon className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">{t("search")}</span>
        </Button>
      </div>
    </form>
  );
};

export default Search;
