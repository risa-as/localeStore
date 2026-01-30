"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import React from "react";
import { useTranslations } from "next-intl";
const MainNav = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) => {
  const t = useTranslations("Profile");

  const links = [
    { title: t("orders"), href: "/user/orders" },
    { title: t("title"), href: "/user/profile" },
  ];
  const pathname = usePathname();
  return (
    <nav
      className={cn("flex items-center gap-4", className)}
      {...props}
    >
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            pathname.includes(item.href)
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          {item.title}
        </Link>
      ))}
    </nav>
  );
};

export default MainNav;
