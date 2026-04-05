import { buttonVariants } from "@/components/ui/button";
import ModeToggle from "./mode-toggle";
import { ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import UserButton from "./user-button";
import LanguageSwitcher from "./language-switcher";
import { getTranslations } from "next-intl/server";
import { getMyCart } from "@/lib/actions/cart.actions";
import { Menu as MenuIcon } from "lucide-react";

const Menu = async () => {
  const t = await getTranslations();
  const cart = await getMyCart();
  const cartItemsCount = cart?.items?.reduce((a, c) => a + c.qty, 0) ?? 0;

  return (
    <div className="flex items-center gap-1">
      {/* Desktop */}
      <nav className="hidden md:flex items-center gap-1">
        <ModeToggle />
        <LanguageSwitcher />
        <Link
          href="/cart"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label={t("Menu.cart")}
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            {cartItemsCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center px-1">
                {cartItemsCount > 99 ? "99+" : cartItemsCount}
              </span>
            )}
          </div>
        </Link>
        <UserButton />
      </nav>

      {/* Mobile */}
      <nav className="md:hidden flex items-center gap-1">
        <Link
          href="/cart"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label={t("Menu.cart")}
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            {cartItemsCount > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center px-1">
                {cartItemsCount > 99 ? "99+" : cartItemsCount}
              </span>
            )}
          </div>
        </Link>
        <Sheet>
          <SheetTrigger
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label={t("Menu.menu")}
          >
            <MenuIcon className="w-5 h-5" />
          </SheetTrigger>
          <SheetContent className="flex flex-col gap-5 pt-10">
            <SheetTitle className="text-lg font-bold">{t("Menu.menu")}</SheetTitle>
            <div className="flex items-center gap-2">
              <ModeToggle />
              <LanguageSwitcher />
            </div>
            <UserButton />
            <SheetDescription />
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
};

export default Menu;
