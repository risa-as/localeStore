import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import {
  getAllBatchesWithStatus,
  getProductsForBatchSelect,
  deleteBatch,
} from "@/lib/actions/batch.actions";
import { formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import BatchForm from "@/components/admin/batch-form";
import DeleteDialog from "@/components/shared/delete-dialog";
import { Layers, Boxes, Package, Warehouse, PackageCheck } from "lucide-react";

export const metadata: Metadata = { title: "الدفعات" };

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const BatchesPage = async () => {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const [{ rows, summary }, products] = await Promise.all([
    getAllBatchesWithStatus(),
    getProductsForBatchSelect(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">الدفعات</h1>
            <p className="text-sm text-muted-foreground">
              تتبّع دفعات الشراء — التكلفة تُحتسب حسب الدفعات (الأقدم شراءً أولاً)
            </p>
          </div>
        </div>
        <BatchForm products={products} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="عدد الدفعات"
          value={String(summary.totalBatches)}
          icon={Boxes}
        />
        <StatCard
          label="إجمالي الكمية المتبقية"
          value={String(summary.totalRemainingQty)}
          sub="قطعة"
          icon={Package}
        />
        <StatCard
          label="قيمة المخزون المتبقي"
          value={formatCurrency(summary.totalRemainingValue)}
          sub="المتبقي × تكلفة الدفعة"
          icon={Warehouse}
        />
        <StatCard
          label="إجمالي المُستهلك"
          value={String(summary.totalConsumed)}
          sub="قطعة مباعة من الدفعات"
          icon={PackageCheck}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">المنتج</TableHead>
              <TableHead className="font-semibold">رقم الدفعة</TableHead>
              <TableHead className="text-center font-semibold">الكمية</TableHead>
              <TableHead className="text-center font-semibold">المتبقي</TableHead>
              <TableHead className="text-center font-semibold">المُستهلك</TableHead>
              <TableHead className="text-right font-semibold">تكلفة الوحدة</TableHead>
              <TableHead className="text-right font-semibold">القيمة المتبقية</TableHead>
              <TableHead className="font-semibold">تاريخ الإضافة</TableHead>
              <TableHead className="text-center font-semibold w-[90px]">
                إجراءات
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-12 text-muted-foreground"
                >
                  لا توجد دفعات بعد. اضغط «إضافة دفعة» للبدء.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium max-w-[220px]">
                    <span className="line-clamp-2">{row.productName}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.batchNumber || "—"}
                  </TableCell>
                  <TableCell className="text-center">{row.quantity}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-sm font-bold px-2 ${
                        row.remaining <= 0
                          ? "bg-muted text-muted-foreground"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      }`}
                    >
                      {row.remaining}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {row.consumed}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(row.costPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(row.valueRemaining)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.addedDate || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <BatchForm products={products} batch={row} />
                      <DeleteDialog id={row.id} action={deleteBatch} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        ملاحظة: «المتبقي» و«المُستهلك» يُحتسبان حسب الدفعات (الأقدم شراءً أولاً)
        من الطلبات التي خرجت بضاعتها من المخزن — المكتملة <strong>والمعلّقة</strong>{" "}
        — والتي أُنشئت بعد إضافة أول دفعة لكل منتج. المبيعات الأقدم تبقى على
        التكلفة السابقة ولا تتأثر. الطلبات الراجعة تُعيد كميتها تلقائياً إلى
        الدفعة.
      </p>
    </div>
  );
};

export default BatchesPage;
