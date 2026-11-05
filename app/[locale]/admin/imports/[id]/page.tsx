import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import {
  getImportCandidate,
  getImportComparison,
  getImportFxDefault,
  getImportSettings,
  getProductsForImport,
} from "@/lib/actions/import.actions";
import ImportCandidateForm from "@/components/admin/imports/import-candidate-form";
import ImportComparisonCard from "@/components/admin/imports/import-comparison";

export const metadata: Metadata = { title: "منتج مرشح" };

export default async function ImportCandidatePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ arrive?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const { id } = await props.params;
  const { arrive } = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const candidate = await getImportCandidate(id);
  if (!candidate) notFound();

  const [settings, products, fx, comparison] = await Promise.all([
    getImportSettings(),
    getProductsForImport(),
    getImportFxDefault(),
    candidate.status === "converted" ? getImportComparison(id).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="space-y-1">
        <Link
          href="/admin/imports"
          className="group inline-flex items-center gap-2 rounded-full border bg-card py-1.5 pe-3.5 ps-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-foreground group-hover:text-background">
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
          العودة إلى الاستيراد
        </Link>
        <h1 className="text-2xl font-bold">{candidate.name}</h1>
      </div>
      <ImportCandidateForm
        key={`${candidate.id}:${candidate.updatedAt}`}
        candidate={candidate}
        settings={settings}
        products={products}
        fxDefault={fx}
        comparison={comparison ? <ImportComparisonCard data={comparison} /> : null}
        openArrival={arrive === "1"}
      />
    </div>
  );
}
