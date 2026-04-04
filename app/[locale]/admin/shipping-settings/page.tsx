import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getShippingSettings } from "@/lib/actions/shipping-settings.actions";
import ShippingSettingsForm from "./shipping-settings-form";
import { Metadata } from "next";
import { Truck } from "lucide-react";

export const metadata: Metadata = { title: "إعدادات التوصيل" };

export default async function ShippingSettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const settings = await getShippingSettings();

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Truck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">إعدادات تكلفة التوصيل</h1>
          <p className="text-sm text-muted-foreground">
            التكلفة الفعلية المدفوعة لشركة النقل — تُستخدم لحساب صافي الربح
          </p>
        </div>

        <ShippingSettingsForm
          baghdadCost={Number(settings.baghdadCost)}
          othersCost={Number(settings.othersCost)}
        />
      </div>
    </div>
  );
}
