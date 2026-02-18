"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import React from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

const MainNav = ({
  className,
  role: roleProp,
  ...props
}: React.HTMLAttributes<HTMLElement> & { role?: string }) => {
  const t = useTranslations('Admin');
  const { data: session } = useSession();
  const role = session?.user?.role || roleProp;

  const links = [
    { title: t('overview'), href: "/admin/overview", hide: role !== "admin" },
    { title: t('products'), href: "/admin/products" },
    { title: t('categories'), href: "/admin/categories" },
    { title: t('orders'), href: "/admin/orders" },
    { title: t('users'), href: "/admin/users", hide: role !== "admin" },
    { title: t('profitAnalysis'), href: "/admin/profit", hide: role !== "admin" },
  ];
  const pathname = usePathname();
  return (
    <nav
      className={cn("flex items-center gap-4 lg:gap-6 overflow-x-auto whitespace-nowrap pb-2", className)}
      {...props}
    >
      {links.filter(link => !link.hide).map((item) => (
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
