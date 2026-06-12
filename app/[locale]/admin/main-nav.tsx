"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import React from "react";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard, Package, Tag, ShoppingCart,
  Users, TrendingUp, Receipt, Truck, Flame, Settings, BarChart2,
} from "lucide-react";

const MainNav = ({
  className,
  role,
  ...props
}: React.HTMLAttributes<HTMLElement> & { role?: string }) => {
  const t = useTranslations("Admin");

  const links = [
    { title: t("overview"),        href: "/admin/overview",          icon: LayoutDashboard, hide: role !== "admin" },
    { title: t("products"),        href: "/admin/products",          icon: Package },
    { title: t("categories"),      href: "/admin/categories",        icon: Tag },
    { title: t("orders"),          href: "/admin/orders",            icon: ShoppingCart },
    { title: t("modonStats"),      href: "/admin/modon-stats",       icon: BarChart2,  hide: role !== "admin" },
    { title: t("users"),           href: "/admin/users",             icon: Users,     hide: role !== "admin" },
    { title: t("profitAnalysis"),  href: "/admin/profit",            icon: TrendingUp, hide: role !== "admin" },
    { title: t("expenses"),        href: "/admin/expenses",          icon: Receipt,   hide: role !== "admin" },
    { title: t("shippingSettings"),href: "/admin/shipping-settings", icon: Truck,     hide: role !== "admin" },
    { title: t("dealSettings"),    href: "/admin/deal-settings",     icon: Flame,     hide: role !== "admin" },
    { title: t("siteSettings"),    href: "/admin/site-settings",     icon: Settings,  hide: role !== "admin" },
  ];

  const pathname = usePathname();

  return (
    <nav
      className={cn("flex items-center gap-1 overflow-x-auto scrollbar-none", className)}
      {...props}
    >
      {links.filter((l) => !l.hide).map((item) => {
        const active = pathname.includes(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
};

export default MainNav;
