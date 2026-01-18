import Link from "next/link";
import { getAllProducts, deleteProduct } from "@/lib/actions/product.actions";
import { formatCurrency, formatId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

const AdminProductsPage = async (props: {
  searchParams: Promise<{
    page: string;
    query: string;
    category: string;
  }>;
}) => {
  await requireAdmin();

  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const searchText = searchParams.query || "";
  const category = searchParams.category || "";

  const products = await getAllProducts({
    query: searchText,
    page,
    category,
  });

  const t = await getTranslations('Admin');

  return (
    <div className="space-y-2">
      <div className="flex-between">
        <div className="flex items-center gap-3">
          <h1 className="h2-bold">{t('products')}</h1>
          {searchText && (
            <div>
              {t('filteredBy')} <i>&quot;{searchText}&quot;</i>{" "}
              <Link href="/admin/products">
                <Button variant="outline" size="sm">
                  {t('removeFilter')}
                </Button>
              </Link>
            </div>
          )}
        </div>
        <Button asChild variant="default">
          <Link href="/admin/products/create">{t('createProduct')}</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('id')}</TableHead>
            <TableHead>{t('name')}</TableHead>
            <TableHead className="text-end">{t('price')}</TableHead>
            <TableHead className="text-end">{t('costPrice')}</TableHead>
            <TableHead className="text-end">{t('profit')}</TableHead>
            <TableHead>{t('category')}</TableHead>
            <TableHead>{t('stock')}</TableHead>
            <TableHead>{t('rating')}</TableHead>
            <TableHead className="w-[100px]">{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.data.map((product: any) => (
            <TableRow key={product.id}>
              <TableCell>{formatId(product.id)}</TableCell>
              <TableCell>{product.name}</TableCell>
              <TableCell className="text-end">
                {formatCurrency(product.price)}
              </TableCell>
              <TableCell className="text-end">
                {formatCurrency(product.costPrice)}
              </TableCell>
              <TableCell className="text-end font-bold text-green-600">
                {formatCurrency(Number(product.price) - Number(product.costPrice))}
              </TableCell>
              <TableCell>{product.category}</TableCell>
              <TableCell>{product.stock}</TableCell>
              <TableCell>{product.rating}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/products/${product.id}`}>{t('edit')}</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/landing/${product.slug}`}>View</Link>
                  </Button>
                  <DeleteDialog id={product.id} action={deleteProduct} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {products.totalPages > 1 && (
        <Pagination page={page} totalPages={products.totalPages} />
      )}
    </div>
  );
};

export default AdminProductsPage;
