import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { ArrowRight, Calculator } from "lucide-react";
import {
  getImportFxDefault,
  getImportSettings,
  getProductsForImport,
} from "@/lib/actions/import.actions";
import ImportCandidateForm from "@/components/admin/imports/import-candidate-form";

export const metadata: Metadata = { title: "منتج مرشح جديد" };

export default async function NewImportPage(props: { searchParams: Promise<{ productId?: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const { productId } = await props.searchParams;
  const [settings, products, fx] = await Promise.all([
    getImportSettings(),
    getProductsForImport(),
    getImportFxDefault(),
  ]);

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="space-y-3">
        <Link
          href="/admin/imports"
          className="group inline-flex items-center gap-2 rounded-full border bg-card py-1.5 pe-3.5 ps-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-foreground group-hover:text-background">
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
          العودة إلى الاستيراد
        </Link>
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
            <Calculator className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold leading-tight">منتج مرشح جديد</h1>
            <p className="text-sm text-muted-foreground">احسب التكلفة الواصلة والربح المتوقع قبل الطلب من المورد</p>
          </div>
        </div>
      </div>
      <ImportCandidateForm settings={settings} products={products} fxDefault={fx} presetProductId={productId} />
    </div>
  );
}
