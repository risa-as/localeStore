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
        <Link href="/admin/imports" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-3.5 w-3.5" />
          الاستيراد
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
