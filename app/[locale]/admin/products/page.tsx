import Link from "next/link";
import { AlertTriangle, Boxes, Eye, Layers, Package, Pencil, Plus, Search, Star, Warehouse, X } from "lucide-react";
import { getAllProducts, deleteProduct } from "@/lib/actions/product.actions";
import { formatCurrency } from "@/lib/utils";
import BatchForm from "@/components/admin/batch-form";
import Image from "next/image";
import { PAGE_SIZE } from "@/lib/constants";
import { getSoldQuantities } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Pagination from "@/components/shared/pagination";
import DeleteDialog from "@/components/shared/delete-dialog";
import { requireAdmin } from "@/lib/auth-guard";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/db/prisma";
import type { Product } from "@/types";

const numberLabel = (value: number) => value.toLocaleString("ar-IQ");

function InventoryStat({ label, value, description, icon: Icon, primary = false }: {
  label: string; value: string; description: string; icon: typeof Package; primary?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-[10px] border p-3 sm:p-5 ${primary ? "border-primary/20 bg-primary/[0.035]" : "bg-card"}`}>
      <dt className="flex items-start justify-between gap-3">
        <span className="pt-1 text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
        <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-[10px] sm:flex ${primary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </dt>
      <dd className="mt-2">
        <span className="block break-words text-xl font-bold leading-tight tracking-tight tabular-nums sm:text-[28px]">{value}</span>
        <span className="mt-2 block text-[11px] leading-5 text-muted-foreground sm:text-xs">{description}</span>
      </dd>
    </div>
  );
}

const AdminProductsPage = async (props: {
  searchParams: Promise<{ page?: string; query?: string; category?: string }>;
}) => {
  const session = await requireAdmin();
  const isAdmin = session?.user?.role === "admin";
  const searchParams = await props.searchParams;
  const page = Math.max(1, Math.trunc(Number(searchParams.page) || 1));
  const searchText = searchParams.query || "";
  const category = searchParams.category || "";
  const [products, soldMap, allProductsForValue, t, locale] = await Promise.all([
    getAllProducts({ query: searchText, page, category }),
    getSoldQuantities(),
    prisma.product.findMany({ select: { id: true, stock: true, costPrice: true } }),
    getTranslations("Admin"),
    getLocale(),
  ]);
  const visibleProducts = products.data as Product[];
  // Same warehouse balance as each row. Home reservations remain physically on the shelf.
  // Sum positive balances individually so an inventory deficit cannot hide other stock.
  const inventory = allProductsForValue.reduce((summary, product) => {
    const remaining = (product.stock ?? 0) - (soldMap.get(product.id) ?? 0);
    if (remaining < 0) summary.deficits++;
    if (remaining > 0) {
      summary.pieces += remaining;
      summary.inStock++;
      summary.value += remaining * Number(product.costPrice);
      if (remaining <= 5) summary.lowStock++;
    }
    return summary;
  }, { pieces: 0, inStock: 0, lowStock: 0, deficits: 0, value: 0 });
  const baseHref = `/${locale}/admin/products`;
  const hasFilters = !!searchText || (!!category && category !== "all");

  return (
    <div data-admin-products dir="rtl" className="min-w-0 space-y-5 text-foreground [&_button]:rounded-[10px] [&_input]:rounded-[10px] [&_a]:rounded-[10px]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border bg-card">
            <Package className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("products")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">إدارة المنتجات والأسعار ومتابعة رصيد المخزن.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <Button asChild variant="outline" className="gap-2 bg-card">
            <Link href={`/${locale}/admin/batches`}><Layers className="h-4 w-4" /> إدارة الدفعات</Link>
          </Button>}
          <Button asChild className="gap-2">
            <Link href={`${baseHref}/create`}><Plus className="h-4 w-4" />{t("createProduct")}</Link>
          </Button>
        </div>
      </header>

      <section aria-label="ملخص المخزون" className="space-y-2.5">
        <dl className={`grid grid-cols-2 gap-3 ${isAdmin ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          <InventoryStat label="إجمالي القطع في المخزن" value={`${numberLabel(inventory.pieces)} قطعة`} description="مجموع المتبقي لجميع المنتجات؛ لا يتأثر بالبحث أو التنقل بين الصفحات." icon={Boxes} primary />
          <InventoryStat label="منتجات برصيد متوفر" value={numberLabel(inventory.inStock)} description="عدد المنتجات التي لديها قطعة واحدة على الأقل في المخزن." icon={Package} />
          <InventoryStat label="منتجات قاربت على النفاد" value={numberLabel(inventory.lowStock)} description="منتجات بقي منها من قطعة إلى ٥ قطع؛ راجع الدفعات قبل نفادها." icon={AlertTriangle} />
          {isAdmin && <InventoryStat label="قيمة المخزون بسعر الشراء" value={formatCurrency(inventory.value)} description="بسعر الشراء المسجل للمنتج؛ الأرصدة الصفرية والسالبة مستثناة." icon={Warehouse} />}
        </dl>
        {inventory.deficits > 0 && <p role="status" className="flex items-start gap-2 rounded-[10px] border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          يوجد {numberLabel(inventory.deficits)} منتج برصيد سالب يحتاج مراجعة الجرد. يظهر العجز في عمود «المتبقي» ولا يُخصم من قطع المنتجات الأخرى في الملخص.
        </p>}
      </section>

      <section aria-label="قائمة المنتجات" className="min-w-0 overflow-clip rounded-[10px] border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex shrink-0 items-center gap-2.5">
            <h2 className="text-base font-bold">قائمة المنتجات</h2>
            <Badge variant="secondary" className="rounded-[10px] px-2.5 py-1 text-xs font-medium">{numberLabel(visibleProducts.length)} منتج في هذه الصفحة</Badge>
          </div>
          <form method="GET" action={baseHref} role="search" className="flex w-full min-w-0 gap-2 lg:max-w-lg">
            {category && category !== "all" && <input type="hidden" name="category" value={category} />}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input aria-label="البحث عن منتج بالاسم" name="query" type="search" defaultValue={searchText} placeholder="ابحث باسم المنتج…" className="h-10 w-full rounded-[10px] border bg-background pe-3 ps-10 text-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
            </div>
            <Button type="submit" className="h-10 px-4">بحث</Button>
            {hasFilters && <Button asChild type="button" variant="outline" className="h-10 gap-1.5 px-3">
              <Link href={baseHref}><X className="h-3.5 w-3.5" /> مسح</Link>
            </Button>}
          </form>
        </div>
        {hasFilters && <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          <span>النتائج حسب:</span>
          {searchText && <Badge variant="outline" className="max-w-full break-all rounded-[10px] bg-card text-xs">الاسم: {searchText}</Badge>}
          {category && category !== "all" && <Badge variant="outline" className="rounded-[10px] bg-card text-xs">الفئة: {category}</Badge>}
          <span className="lg:ms-auto">ملخص المخزون يشمل جميع المنتجات.</span>
        </div>}

        <p className="border-b bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground min-[1440px]:hidden">اسحب الجدول أفقياً لعرض بقية الحقول والإجراءات.</p>

          <Table aria-label="تفاصيل المنتجات والأسعار والمخزون" containerClassName="min-[1440px]:overflow-visible" className="min-w-[1280px] text-sm [&_td]:px-3 [&_td]:py-3 [&_th]:px-3">
            <TableHeader className="z-20 bg-card shadow-[0_1px_0_hsl(var(--border))] min-[1440px]:sticky min-[1440px]:top-14">
              <TableRow className="bg-muted/35 text-xs hover:bg-muted/35">
                <TableHead colSpan={3} className="h-9 border-e text-xs font-medium">بيانات المنتج</TableHead>
                <TableHead colSpan={5} className="h-9 border-e text-xs font-medium">الأسعار والعروض</TableHead>
                <TableHead colSpan={2} className="h-9 border-e text-center text-xs font-medium">المخزون</TableHead>
                <TableHead colSpan={2} className="h-9 text-center text-xs font-medium">التقييم والإدارة</TableHead>
              </TableRow>
              <TableRow className="bg-card hover:bg-card [&_th]:h-12 [&_th]:whitespace-nowrap [&_th]:text-xs [&_th]:font-semibold [&_th]:text-foreground/75">
                <TableHead className="w-10">#</TableHead>
                <TableHead className="w-[76px]">{t("image")}</TableHead>
                <TableHead className="min-w-[210px]">{t("name")}</TableHead>
                <TableHead className="text-right">{t("price")}</TableHead>
                <TableHead className="text-right">{t("costPrice")}</TableHead>
                <TableHead className="text-right">{t("shippingPrice")}</TableHead>
                <TableHead className="text-right">{t("profit")}</TableHead>
                <TableHead className="min-w-[130px]">{t("offers")}</TableHead>
                <TableHead className="text-center">{t("stock")}<span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">إجمالي الدفعات</span></TableHead>
                <TableHead className="text-center">المتبقي</TableHead>
                <TableHead className="text-center">{t("rating")}</TableHead>
                <TableHead className="w-[160px] text-center">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProducts.map((product, index) => {
                const remaining = (product.stock ?? 0) - (soldMap.get(product.id) ?? 0);
                const profit = Number(product.price) - Number(product.costPrice);
                const stockStyle = remaining <= 0 ? "border-red-500/15 bg-red-500/5 text-red-700 dark:text-red-400" : remaining <= 5 ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400" : "border-emerald-500/15 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
                return (
                  <TableRow key={product.id} className="group hover:bg-muted/25">
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{numberLabel((page - 1) * PAGE_SIZE + index + 1)}</TableCell>
                    <TableCell>{product.images?.[0] ? (
                      <Image src={product.images[0]} alt={product.name} width={52} height={52} className="h-[52px] w-[52px] rounded-[10px] border bg-background object-cover" unoptimized />
                    ) : <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[10px] border bg-muted/50"><Package className="h-5 w-5 text-muted-foreground" aria-label="بلا صورة" /></div>}</TableCell>
                    <TableCell className="max-w-[250px]">
                      <Link href={`${baseHref}/${product.id}`} className="block font-semibold leading-6 text-foreground transition hover:text-primary/70 hover:underline">{product.name}</Link>
                      {product.categories?.length > 0 && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{product.categories.join(" · ")}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-semibold tabular-nums"><bdi>{formatCurrency(product.price)}</bdi></TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground"><bdi>{formatCurrency(product.costPrice)}</bdi></TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground"><bdi>{formatCurrency(product.shippingPrice)}</bdi></TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums"><span className={`font-semibold ${profit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}><bdi>{formatCurrency(profit)}</bdi></span></TableCell>
                    <TableCell className="max-w-[190px]">{product.offers ? <Badge variant="outline" className="whitespace-normal rounded-[10px] border-dashed px-2 py-1 text-xs font-normal leading-5">{product.offers}</Badge> : <span className="text-xs text-muted-foreground">لا توجد عروض</span>}</TableCell>
                    <TableCell className="text-center font-medium tabular-nums">{numberLabel(product.stock)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-flex min-w-[60px] flex-col items-center gap-0.5 rounded-[10px] border px-2.5 py-1.5 ${stockStyle}`}>
                        <bdi className="text-sm font-bold tabular-nums">{numberLabel(remaining)}</bdi>
                        <span className="text-[10px]">{remaining < 0 ? "عجز جرد" : remaining === 0 ? "نفد المخزون" : remaining <= 5 ? "رصيد منخفض" : "متوفر"}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-center"><span className="inline-flex items-center gap-1.5 tabular-nums"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" /><span>{Number(product.rating).toFixed(1)}</span></span></TableCell>
                    <TableCell><div className="flex items-center justify-center gap-0.5 rounded-[10px] border bg-background p-0.5 [&_button]:h-8 [&_button]:w-8 [&_a]:h-8 [&_a]:w-8">
                      {isAdmin && <BatchForm products={[{ id: product.id, name: product.name }]} presetProductId={product.id} compact />}
                      <Button asChild variant="ghost" size="icon" className="text-foreground" title={t("edit")}><Link href={`${baseHref}/${product.id}`} aria-label={`تعديل ${product.name}`}><Pencil className="h-3.5 w-3.5" /></Link></Button>
                      <Button asChild variant="ghost" size="icon" className="text-foreground" title={t("details")}><Link href={`/${locale}/landing/${product.slug}`} aria-label={`عرض ${product.name}`}><Eye className="h-3.5 w-3.5" /></Link></Button>
                      <DeleteDialog id={product.id} action={deleteProduct} triggerLabel={`حذف ${product.name}`} />
                    </div></TableCell>
                  </TableRow>
                );
              })}
              {visibleProducts.length === 0 && <TableRow><TableCell colSpan={12} className="h-56 text-center">
                <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-6">
                  <Search className="mb-1 h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
                  <p className="font-semibold">{hasFilters ? "لا توجد منتجات تطابق البحث" : "لا توجد منتجات حتى الآن"}</p>
                  <p className="text-sm text-muted-foreground">{hasFilters ? "جرّب اسماً آخر أو امسح الفلاتر لعرض المنتجات." : "ابدأ بإضافة منتج جديد لتظهر بياناته هنا."}</p>
                  {hasFilters && <Link href={baseHref} className="mt-1 text-sm font-medium underline underline-offset-4">عرض جميع المنتجات</Link>}
                </div>
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        <footer className="flex flex-col gap-3 border-t bg-muted/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">المتبقي = إجمالي الدفعات − الكمية الخارجة من المخزن. <span className="block sm:inline">يعود الراجع للرصيد عند استلامه في المخزن.</span></p>
          {products.totalPages > 1 ? <div className="shrink-0 self-center [&_button]:h-9 [&_button]:w-20 [&_button]:px-2"><Pagination page={page} totalPages={products.totalPages} labels={{ previous: "السابق", next: "التالي" }} /></div> : <span className="shrink-0 text-xs text-muted-foreground">صفحة {numberLabel(page)} من {numberLabel(Math.max(1, products.totalPages))}</span>}
        </footer>
      </section>
    </div>
  );
};

export default AdminProductsPage;
