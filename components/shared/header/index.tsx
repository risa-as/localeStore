import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { APP_NAME } from "@/lib/constants";
import Menu from "./menu";
import CategoryDrawer from "./category-drawer";
import Search from "./search";
import { getLogoUrl } from "@/lib/get-logo";

const Header = async () => {
  const logoUrl = await getLogoUrl();
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-sm">
      <div className="container mx-auto px-3 sm:px-6">
        {/* Main row */}
        <div className="flex items-center h-16 sm:h-18 gap-2 sm:gap-4">

          {/* Hamburger */}
          <CategoryDrawer />

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 group">
            <div className="relative">
              <Image
                src={logoUrl}
                alt={`${APP_NAME} logo`}
                width={40}
                height={40}
                priority
                className="rounded-xl group-hover:scale-105 transition-transform"
              />
            </div>
            <span className="hidden md:block font-extrabold text-xl tracking-tight">
              {APP_NAME}
            </span>
          </Link>

          {/* Search — desktop center */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-auto">
            <Search />
          </div>

          {/* Actions */}
          <div className="ml-auto">
            <Menu />
          </div>
        </div>

        {/* Mobile search row */}
        <div className="md:hidden pb-3">
          <Search />
        </div>
      </div>
    </header>
  );
};

export default Header;
