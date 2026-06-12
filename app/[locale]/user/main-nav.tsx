"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import React from "react";
import { useTranslations } from "next-intl";
import { ShoppingBag, User } from "lucide-react";

const MainNav = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => {
  const t = useTranslations("Profile");
  const links = [
    { title: t("orders"), href: "/user/orders", icon: ShoppingBag },
    { title: t("title"), href: "/user/profile", icon: User },
  ];
  const pathname = usePathname();

  return (
    <nav className={cn("flex items-center gap-1.5 sm:gap-2", className)} {...props}>
      {links.map(({ title, href, icon: Icon }) => {
        const active = pathname.includes(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base font-bold transition-all whitespace-nowrap",
              active
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {title}
          </Link>
        );
      })}
    </nav>
  );
};

export default MainNav;
