"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import React from "react";
import { useTranslations } from "next-intl";
import {
  BadgePercent, ChartColumn, ClipboardList, Inbox, Layers, LayoutDashboard,
  ListChecks, Megaphone, MessageSquareText, Package, ReceiptText, Settings,
  Ship, Tags, TrendingUp, Truck, UsersRound,
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
    { title: t("batches"),         href: "/admin/batches",           icon: Layers,    hide: role !== "admin" },
    { title: "الاستيراد",           href: "/admin/imports",           icon: Ship,      hide: role !== "admin" },
    { title: t("categories"),      href: "/admin/categories",        icon: Tags },
    { title: t("orders"),          href: "/admin/orders",            icon: ClipboardList },
    { title: t("chats"),           href: "/admin/chats",             icon: MessageSquareText },
    { title: "رسائل الصفحات",       href: "/admin/social-inbox",      icon: Inbox, hide: role !== "admin" },
    { title: "المتابعة",            href: "/admin/follow-up",         icon: ListChecks },
    { title: t("marketing"),       href: "/admin/marketing",         icon: Megaphone, hide: role !== "admin" },
    { title: t("modonStats"),      href: "/admin/modon-stats",       icon: ChartColumn, hide: role !== "admin" },
    { title: t("users"),           href: "/admin/users",             icon: UsersRound, hide: role !== "admin" },
    { title: t("profitAnalysis"),  href: "/admin/profit",            icon: TrendingUp, hide: role !== "admin" },
    { title: t("expenses"),        href: "/admin/expenses",          icon: ReceiptText, hide: role !== "admin" },
    { title: t("shippingSettings"),href: "/admin/shipping-settings", icon: Truck,     hide: role !== "admin" },
    { title: t("dealSettings"),    href: "/admin/deal-settings",     icon: BadgePercent, hide: role !== "admin" },
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
            <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
};

export default MainNav;
