import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getSiteSettings } from "@/lib/actions/site-settings.actions";
import LogoSettingsForm from "./logo-settings-form";
import { Metadata } from "next";
import { ImageIcon } from "lucide-react";

export const metadata: Metadata = { title: "إعدادات الموقع" };

export default async function SiteSettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const settings = await getSiteSettings();

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <ImageIcon className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">إعدادات اللوغو</h1>
          <p className="text-sm text-muted-foreground">
            تغيير لوغو المتجر الذي يظهر في جميع صفحات الموقع
          </p>
        </div>

        <LogoSettingsForm currentLogoUrl={settings.logoUrl} />
      </div>
    </div>
  );
}
