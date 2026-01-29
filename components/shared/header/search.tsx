import { Input } from "@/components/ui/input";
import { AccessibleButton } from "@/components/ui/accessible-button";
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

const Search = async () => {
  const categories = await getAllCategories();
  const t = await getTranslations('Search');

  return (
    <form action="/search" method="GET">
      <div className="flex w-full max-w-sm items-center space-x-2">
        <Select name="category" >
          <SelectTrigger className="w-[180px] ml-2">
            <SelectValue placeholder={t('all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem key="All" value="all">
              {t('all')}
            </SelectItem>
            {categories &&
              categories.map((x) => (
                <SelectItem key={x.category} value={x.category}>
                  {x.category}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Input
          name="q"
          type="text"
          placeholder={t('placeholder')}
          className="md:w-[100px] lg:w-[300px]"
        />
        <AccessibleButton
          type="submit"
          label={t('search')}
          icon={<SearchIcon />}
        />
      </div>
    </form>
  );
};

export default Search;
