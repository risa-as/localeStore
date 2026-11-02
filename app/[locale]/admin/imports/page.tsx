import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { Plus, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getImportCandidates,
  getImportSettings,
  getReorderAlerts,
} from "@/lib/actions/import.actions";
import ImportsDashboard from "@/components/admin/imports/imports-dashboard";
import ImportSettingsDialog from "@/components/admin/imports/import-settings-dialog";

export const metadata: Metadata = { title: "الاستيراد" };

export default async function ImportsPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const [settings, candidates, reorder] = await Promise.all([
    getImportSettings(),
    getImportCandidates(),
    // تنبيهات إعادة الطلب ثانوية — فشلها لا يُسقط اللوحة.
    getReorderAlerts().catch(() => ({ alerts: [], warnings: [], windowDays: 0 })),
  ]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Ship className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">الاستيراد</h1>
            <p className="text-sm text-muted-foreground">
              ادرس كل منتج قبل استيراده: التكلفة الواصلة، الربح المتوقع، ومتى تعيد الطلب.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportSettingsDialog settings={settings} />
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/admin/imports/new">
              <Plus className="h-4 w-4" />
              منتج مرشح جديد
            </Link>
          </Button>
        </div>
      </div>

      <ImportsDashboard
        candidates={candidates}
        alerts={reorder.alerts}
        warnings={reorder.warnings}
        windowDays={reorder.windowDays}
      />
    </div>
  );
}
