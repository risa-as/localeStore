import Link from "next/link";
import { Eye, Pencil, Package, Plus, Warehouse, Search, X } from "lucide-react";
import { getAllProducts, deleteProduct } from "@/lib/actions/product.actions";
import { formatCurrency } from "@/lib/utils";
import BatchForm from "@/components/admin/batch-form";
import Image from "next/image";
import { PAGE_SIZE } from "@/lib/constants";
import { STOCK_CONSUMED_STATUSES } from "@/lib/constants/order-statuses";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/shared/pagination";
import DeleteDialog from "@/components/shared/delete-dialog";
import { requireAdmin } from "@/lib/auth-guard";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/db/prisma";

const AdminProductsPage = async (props: {
  searchParams: Promise<{ page: string; query: string; category: string }>;
}) => {
  const session = await requireAdmin();
  const isAdmin = session?.user?.role === "admin";

  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const searchText = searchParams.query || "";
  const category = searchParams.category || "";

  const [products, soldItems, allProductsForValue] = await Promise.all([
    getAllProducts({ query: searchText, page, category }),
    prisma.orderItem.findMany({
      where: {
        order: { status: { in: STOCK_CONSUMED_STATUSES } },
      },
      select: { productId: true, qty: true },
    }),
    prisma.product.findMany({
      select: { id: true, stock: true, costPrice: true },
    }),
  ]);

  const soldMap = soldItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.productId] = (acc[item.productId] ?? 0) + item.qty;
    return acc;
  }, {});

  // Total inventory value at cost — only products with remaining > 0
  const totalInventoryValue = allProductsForValue.reduce((sum, p) => {
    const remaining = (p.stock ?? 0) - (soldMap[p.id] ?? 0);
    if (remaining <= 0) return sum;
    return sum + remaining * Number(p.costPrice);
  }, 0);

  const t = await getTranslations("Admin");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("products")}</h1>
            <p className="text-sm text-muted-foreground">
              {products.data.length} منتج في هذه الصفحة
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/products/create" className="gap-2">
            <Plus className="w-4 h-4" />
            {t("createProduct")}
          </Link>
        </Button>
      </div>

      {/* Search Bar */}
      <form method="GET" action="/admin/products" className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            name="query"
            defaultValue={searchText}
            placeholder="ابحث عن منتج..."
            className="w-full h-10 rounded-xl border bg-card pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="submit"
          className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          بحث
        </button>
        {searchText && (
          <Link
            href="/admin/products"
            className="h-10 px-4 rounded-xl border bg-card text-sm font-medium hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
            مسح
          </Link>
        )}
      </form>

      {/* Inventory Value Card — admin only */}
      {isAdmin && (
        <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-900/20 p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/40">
            <Warehouse className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium">
              قيمة المخزون بسعر الشراء
            </p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">
              {formatCurrency(totalInventoryValue)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              المنتجات ذات الرصيد السالب مستثناة من الحساب
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold w-12">#</TableHead>
              <TableHead className="font-semibold">{t("image")}</TableHead>
              <TableHead className="font-semibold">{t("name")}</TableHead>
              <TableHead className="text-right font-semibold">
                {t("price")}
              </TableHead>
              <TableHead className="text-right font-semibold">
                {t("costPrice")}
              </TableHead>
              <TableHead className="text-right font-semibold">
                {t("shippingPrice")}
              </TableHead>
              <TableHead className="text-right font-semibold">
                {t("profit")}
              </TableHead>
              <TableHead className="font-semibold">{t("offers")}</TableHead>
              <TableHead className="text-center font-semibold">
                {t("stock")}
              </TableHead>
              <TableHead className="text-center font-semibold">
                المتبقي
              </TableHead>
              <TableHead className="text-center font-semibold">
                {t("rating")}
              </TableHead>
              <TableHead className="text-center font-semibold w-[130px]">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.data.map((product: any, index: number) => {
              const sold = soldMap[product.id] ?? 0;
              const remaining = (product.stock ?? 0) - sold;
              const profit = Number(product.price) - Number(product.costPrice);

              return (
                <TableRow key={product.id} className="hover:bg-muted/30">
                  <TableCell className="text-muted-foreground text-sm">
                    {(page - 1) * PAGE_SIZE + index + 1}
                  </TableCell>

                  <TableCell>
                    {product.images?.[0] ? (
                      <Image
                        src={product.images[0]}
                        alt={product.name}
                        width={48}
                        height={48}
                        className="rounded-lg object-cover border"
                        unoptimized
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                        <Package className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="font-medium max-w-[200px]">
                    <span className="line-clamp-2">{product.name}</span>
                    {product.categories?.length > 0 && (
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        {product.categories.join(', ')}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right font-medium">
                    {formatCurrency(product.price)}
                  </TableCell>

                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(product.costPrice)}
                  </TableCell>

                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(product.shippingPrice)}
                  </TableCell>

                  <TableCell className="text-right">
                    <span
                      className={`font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {formatCurrency(profit)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className="text-xs text-wrap">
                      {product.offers}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-center">
                    <span className="font-medium">{product.stock}</span>
                  </TableCell>

                  <TableCell className="text-center">
                    <span
                      className={`inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-sm font-bold px-2
                      ${
                        remaining <= 0
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : remaining <= 5
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      }`}
                    >
                      {remaining}
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-amber-500 text-sm font-medium">
                        ★
                      </span>
                      <span className="text-sm">
                        {Number(product.rating).toFixed(1)}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      {isAdmin && (
                        <BatchForm
                          products={[{ id: product.id, name: product.name }]}
                          presetProductId={product.id}
                          compact
                        />
                      )}
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title={t("edit")}
                      >
                        <Link href={`/admin/products/${product.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title={t("details")}
                      >
                        <Link href={`/landing/${product.slug}`}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                      <DeleteDialog id={product.id} action={deleteProduct} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {products.totalPages > 1 && (
        <Pagination page={page} totalPages={products.totalPages} />
      )}
    </div>
  );
};

export default AdminProductsPage;
