"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

interface MobileFiltersProps {
    categories: { category: string; _count: number }[];
    prices: { name: string; value: string }[];
    ratings: number[];
    translations: {
        category: string;
        price: string;
        customerRatings: string;
        any: string;
        starsAndUp: string;
        filter: string; // Add filter translation key
    };
}

const MobileFilters = ({
    categories,
    prices,
    ratings,
    translations,
}: MobileFiltersProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();

    const currentCategory = searchParams.get("category") || "all";
    const currentPrice = searchParams.get("price") || "all";
    const currentRating = searchParams.get("rating") || "all";

    const formUrlQuery = (params: Record<string, string | null>) => {
        const newParams = new URLSearchParams(searchParams.toString());

        Object.entries(params).forEach(([key, value]) => {
            if (value === null || value === "all") {
                newParams.delete(key);
            } else {
                newParams.set(key, value);
            }
        });

        return `/search?${newParams.toString()}`;
    };

    const handleCategoryChange = (value: string) => {
        const newValue = currentCategory === value ? "all" : value;
        router.push(formUrlQuery({ category: newValue, page: "1" }));
    };

    const handlePriceChange = (value: string) => {
        const newValue = currentPrice === value ? "all" : value;
        router.push(formUrlQuery({ price: newValue, page: "1" }));
    };

    const handleRatingChange = (value: string) => {
        const newValue = currentRating === value ? "all" : value;
        router.push(formUrlQuery({ rating: newValue, page: "1" }));
    };

    return (
        <Drawer>
            <DrawerTrigger asChild>
                <Button variant="outline" className="gap-2" aria-label={translations.filter || "Filter"}>
                    <Filter className="w-4 h-4" />
                    {translations.filter || "Filter"}
                </Button>
            </DrawerTrigger>
            <DrawerContent>
                <div className="mx-auto w-full max-w-sm">
                    <DrawerHeader>
                        <DrawerTitle>{translations.filter || "Filter"}</DrawerTitle>
                    </DrawerHeader>
                    <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto">
                        {/* Category Links */}
                        <div>
                            <div className="text-lg mb-2 font-semibold">
                                {translations.category}
                            </div>
                            <ul className="space-y-2">
                                <li>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="m-category-all"
                                            checked={currentCategory === "all"}
                                            onCheckedChange={() => handleCategoryChange("all")}
                                        />
                                        <Label htmlFor="m-category-all" className="cursor-pointer">
                                            {translations.any}
                                        </Label>
                                    </div>
                                </li>
                                {categories.map((x) => (
                                    <li key={x.category}>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id={`m-category-${x.category}`}
                                                checked={currentCategory === x.category}
                                                onCheckedChange={() => handleCategoryChange(x.category)}
                                            />
                                            <Label
                                                htmlFor={`m-category-${x.category}`}
                                                className="cursor-pointer"
                                            >
                                                {x.category}
                                            </Label>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Price Links */}
                        <div>
                            <div className="text-lg mb-2 font-semibold">{translations.price}</div>
                            <ul className="space-y-2">
                                <li>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="m-price-all"
                                            checked={currentPrice === "all"}
                                            onCheckedChange={() => handlePriceChange("all")}
                                        />
                                        <Label htmlFor="m-price-all" className="cursor-pointer">
                                            {translations.any}
                                        </Label>
                                    </div>
                                </li>
                                {prices.map((p) => (
                                    <li key={p.value}>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id={`m-price-${p.value}`}
                                                checked={currentPrice === p.value}
                                                onCheckedChange={() => handlePriceChange(p.value)}
                                            />
                                            <Label
                                                htmlFor={`m-price-${p.value}`}
                                                className="cursor-pointer"
                                            >
                                                {p.name}
                                            </Label>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Rating Links */}
                        <div>
                            <div className="text-lg mb-2 font-semibold">
                                {translations.customerRatings}
                            </div>
                            <ul className="space-y-2">
                                <li>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="m-rating-all"
                                            checked={currentRating === "all"}
                                            onCheckedChange={() => handleRatingChange("all")}
                                        />
                                        <Label htmlFor="m-rating-all" className="cursor-pointer">
                                            {translations.any}
                                        </Label>
                                    </div>
                                </li>
                                {ratings.map((r) => (
                                    <li key={r}>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id={`m-rating-${r}`}
                                                checked={currentRating === r.toString()}
                                                onCheckedChange={() => handleRatingChange(r.toString())}
                                            />
                                            <Label
                                                htmlFor={`m-rating-${r}`}
                                                className="cursor-pointer"
                                            >
                                                {r} {translations.starsAndUp}
                                            </Label>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline">{translations.any === "الكل" ? "إغلاق" : "Close"}</Button>
                        </DrawerClose>
                    </DrawerFooter>
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default MobileFilters;
