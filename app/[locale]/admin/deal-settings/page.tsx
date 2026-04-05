import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDealSettings } from "@/lib/actions/deal-settings.actions";
import { getAllProducts } from "@/lib/actions/product.actions";
import DealSettingsForm from "./deal-settings-form";
import { Metadata } from "next";
import { Flame } from "lucide-react";

export const metadata: Metadata = { title: "إعدادات صفقة الشهر" };

export default async function DealSettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const settings = await getDealSettings();
  const products = await getAllProducts({ query: "all", page: 1, limit: 200 });

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-4">
              <Flame className="h-8 w-8 text-orange-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">إعدادات صفقة الشهر</h1>
          <p className="text-sm text-muted-foreground">
            تحكم في عرض قسم الصفقة في الصفحة الرئيسية
          </p>
        </div>

        <DealSettingsForm
          isActive={settings.isActive}
          endDate={settings.endDate.toISOString()}
          productId={settings.productId ?? ""}
          title={settings.title}
          products={products.data.map((p: any) => ({
            id: p.id,
            name: p.name,
            image: p.images[0] ?? "",
          }))}
        />
      </div>
    </div>
  );
}
