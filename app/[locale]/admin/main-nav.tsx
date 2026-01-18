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
  const t = useTranslations('Admin');

  const links = [
    { title: t('overview'), href: "/admin/overview" },
    { title: t('products'), href: "/admin/products" },
    { title: t('categories'), href: "/admin/categories" },
    { title: t('orders'), href: "/admin/orders" },
    { title: t('users'), href: "/admin/users" },
    { title: t('profitAnalysis'), href: "/admin/profit" },
  ];
  const pathname = usePathname();
  return (
    <nav
      className={cn("flex items-center gap-4 lg:gap-6", className)}
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
