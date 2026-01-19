import { Button, buttonVariants } from "@/components/ui/button";
import ModeToggle from "./mode-toggle";
import { EllipsisVertical, ShoppingCart, UserIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import UserButton from "./user-button";
import { CartItem } from "@/types";
import LanguageSwitcher from "./language-switcher";
import { getTranslations } from "next-intl/server";
import { getMyCart } from "@/lib/actions/cart.actions";

const Menu = async () => {
    const t = await getTranslations();
    const cart = await getMyCart();
    const cartItemsCount = cart ? cart.items.length : 0;

    return (<div>
        <nav className="hidden md:flex w-full max-w-xs gap-1">
            <ModeToggle />
            <LanguageSwitcher />
            <Button asChild variant="ghost">
                <Link href="/cart">
                    <div className="relative inline-block">
                        <ShoppingCart />
                        {cartItemsCount > 0 && (
                            <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center">
                                {cartItemsCount}
                            </span>
                        )}
                    </div>
                    <span className="ml-2">{t('Menu.cart')}</span>
                </Link>
            </Button>
            <UserButton />
        </nav>
        <nav className="md:hidden gap-1 flex">
            <Link href="/cart" className={buttonVariants({ variant: "ghost" })}>
                <div className="relative inline-block">
                    <ShoppingCart />
                    {cartItemsCount > 0 && (
                        <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center">
                            {cartItemsCount}
                        </span>
                    )}
                </div>
            </Link>
            <Sheet>
                <SheetTrigger className="align-middle">
                    <EllipsisVertical />
                </SheetTrigger>
                <SheetContent className="flex flex-col items-start">
                    <SheetTitle>{t('Menu.menu')}</SheetTitle>
                    <ModeToggle />
                    <LanguageSwitcher />
                    <UserButton />
                    <SheetDescription />
                </SheetContent>
            </Sheet>
        </nav>
    </div>);
}

export default Menu;