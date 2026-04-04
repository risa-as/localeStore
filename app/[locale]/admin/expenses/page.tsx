import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { getExpenses, getAdCampaigns } from "@/lib/actions/expense.actions";
import { prisma } from "@/db/prisma";
import ExpensesClient from "./expenses-client";

export const metadata: Metadata = { title: "المصاريف والإعلانات" };

export default async function ExpensesPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const [expensesRaw, campaignsRaw, products] = await Promise.all([
    getExpenses(),
    getAdCampaigns(),
    prisma.product.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const expenses = expensesRaw.map((e) => ({
    ...e,
    amount: Number(e.amount),
  }));

  const campaigns = campaignsRaw.map((c) => ({
    ...c,
    amount: Number(c.amount),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BarChart3 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">المصاريف والإعلانات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة المصاريف التشغيلية وحملات الإعلانات لكل منتج
          </p>
        </div>
      </div>

      <ExpensesClient
        expenses={expenses}
        campaigns={campaigns}
        products={products}
      />
    </div>
  );
}
