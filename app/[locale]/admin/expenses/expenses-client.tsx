"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2, Megaphone, Receipt, CopyPlus } from "lucide-react";
import AdSpendSection from "./adspend-client";
import {
  createExpense, updateExpense, deleteExpense,
} from "@/lib/actions/expense.actions";

const EXPENSE_CATEGORIES = [
  { value: "rent",      label: "إيجار" },
  { value: "salary",    label: "رواتب موظفين" },
  { value: "utilities", label: "فواتير (كهرباء / إنترنت)" },
  { value: "transport", label: "نقل وتوصيل" },
  { value: "other",     label: "أخرى" },
];

function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// ─── أنواع مشتركة (سجلات الخادم كما تصل للواجهة) ─────────────────────────────
type ServerRow = {
  id: string;
  category?: string;
  description?: string;
  fromDate: string | Date;
  toDate: string | Date;
  amount: number | string;
  notes?: string | null;
};

// ─── Expense Form ─────────────────────────────────────────────────────────────
function ExpenseForm({
  initial,
  onDone,
}: {
  initial?: ServerRow;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    category:    initial?.category    ?? "rent",
    description: initial?.description ?? "",
    fromDate:    initial?.fromDate    ? new Date(initial.fromDate).toISOString().split("T")[0] : "",
    toDate:      initial?.toDate      ? new Date(initial.toDate).toISOString().split("T")[0]   : "",
    amount:      initial?.amount      ? String(initial.amount) : "",
    notes:       initial?.notes       ?? "",
  });

  const submit = () => {
    start(async () => {
      const res = initial
        ? await updateExpense(initial.id, form as never)
        : await createExpense(form as never);
      if (res.success) {
        toast({ title: "تم الحفظ بنجاح" });
        onDone();
      } else {
        toast({ variant: "destructive", title: res.message });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">التصنيف</label>
        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium">الوصف</label>
        <Input className="mt-1" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">من تاريخ</label>
          <Input className="mt-1" type="date" value={form.fromDate}
            onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-medium">إلى تاريخ</label>
          <Input className="mt-1" type="date" value={form.toDate}
            onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">المبلغ (دينار عراقي)</label>
        <Input className="mt-1" type="number" value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <div>
        <label className="text-sm font-medium">ملاحظات (اختياري)</label>
        <Input className="mt-1" value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={submit} disabled={isPending}>
          {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          حفظ
        </Button>
      </div>
    </div>
  );
}

// ─── Delete Button ─────────────────────────────────────────────────────────────
function DeleteBtn({ onDelete }: { onDelete: () => Promise<{ success: boolean; message?: string }> }) {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  return (
    <Button size="icon" variant="ghost"
      className="text-red-500 hover:text-red-700"
      disabled={isPending}
      onClick={() => start(async () => {
        const res = await onDelete();
        if (!res.success) toast({ variant: "destructive", title: res.message });
      })}>
      {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </Button>
  );
}

// ─── تكرار مصروف للشهر التالي ─────────────────────────────────────────────────
/** يزيح تاريخاً شهراً واحداً مع تثبيت آخر يوم في الأشهر الأقصر (31 → 28/30). */
function addMonth(d: Date): Date {
  const day = d.getUTCDate();
  const shifted = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12),
  );
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}

/** المصاريف الثابتة (إيجار/رواتب) تتكرّر شهرياً — زر ينسخها للشهر التالي. */
function RepeatBtn({ row }: { row: ServerRow }) {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      title="تكرار للشهر التالي"
      disabled={isPending}
      onClick={() =>
        start(async () => {
          const res = await createExpense({
            category: row.category ?? "other",
            description: row.description ?? "",
            fromDate: addMonth(new Date(row.fromDate)).toISOString().split("T")[0],
            toDate: addMonth(new Date(row.toDate)).toISOString().split("T")[0],
            amount: String(row.amount),
            notes: row.notes ?? "",
          } as never);
          toast(
            res.success
              ? { title: "أُضيف نفس المصروف للشهر التالي" }
              : { variant: "destructive", title: res.message },
          );
        })
      }
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <CopyPlus className="w-4 h-4" />
      )}
    </Button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ExpensesClient({
  expenses,
  products,
}: {
  expenses: ServerRow[];
  products: { id: string; name: string }[];
}) {
  const [expenseOpen, setExpenseOpen]   = useState(false);
  const [editExpense,  setEditExpense]  = useState<ServerRow | null>(null);
  // فلتر فترة — الجدول كان يعرض كل المصاريف منذ البداية، فيصعب مطابقته بصفحة
  // الأرباح التي توزّع المصروف على الفترة المختارة. فارغ = الكل.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const shown = useMemo(() => {
    if (!from && !to) return expenses;
    const f = from ? new Date(`${from}T00:00:00.000Z`) : null;
    const t = to ? new Date(`${to}T23:59:59.999Z`) : null;
    // يُعرض المصروف إن تقاطع مداه مع الفترة (لا اشتراط الاحتواء الكامل).
    return expenses.filter((e) => {
      const ef = new Date(e.fromDate);
      const et = new Date(e.toDate);
      if (f && et < f) return false;
      if (t && ef > t) return false;
      return true;
    });
  }, [expenses, from, to]);

  const shownTotal = useMemo(
    () => shown.reduce((sum, e) => sum + Number(e.amount), 0),
    [shown],
  );

  const thisMonth = () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const last = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).getUTCDate();
    setFrom(`${y}-${m}-01`);
    setTo(`${y}-${m}-${String(last).padStart(2, "0")}`);
  };

  return (
    <Tabs defaultValue="expenses" dir="rtl">
      <TabsList className="mb-6">
        <TabsTrigger value="expenses" className="gap-2">
          <Receipt className="w-4 h-4" /> المصاريف التشغيلية
        </TabsTrigger>
        <TabsTrigger value="campaigns" className="gap-2">
          <Megaphone className="w-4 h-4" /> حملات الإعلانات
        </TabsTrigger>
      </TabsList>

      {/* ── Expenses Tab ── */}
      <TabsContent value="expenses">
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <label className="text-xs text-muted-foreground">من</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">إلى</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-40" />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={thisMonth}>هذا الشهر</Button>
          {(from || to) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFrom(""); setTo(""); }}>
              الكل
            </Button>
          )}
          <span className="text-sm text-muted-foreground ms-auto">
            {shown.length} مصروف · الإجمالي {formatCurrency(shownTotal)}
          </span>
          <Dialog open={expenseOpen} onOpenChange={(o) => { setExpenseOpen(o); if (!o) setEditExpense(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditExpense(null)}>
                <Plus className="w-4 h-4 mr-2" /> إضافة مصروف
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editExpense ? "تعديل مصروف" : "إضافة مصروف جديد"}</DialogTitle>
              </DialogHeader>
              <ExpenseForm initial={editExpense ?? undefined} onDone={() => setExpenseOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {shown.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            {expenses.length === 0 ? "لا توجد مصاريف مسجلة" : "لا مصاريف ضمن هذه الفترة"}
          </p>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>التصنيف</TableHead>
                  <TableHead>الوصف</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((e, index) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-center text-muted-foreground text-sm">{index + 1}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{categoryLabel(e.category ?? "other")}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{e.description ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(e.fromDate).toLocaleDateString("ar-IQ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(e.toDate).toLocaleDateString("ar-IQ")}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(Number(e.amount))}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Dialog open={editExpense?.id === e.id && expenseOpen}
                          onOpenChange={(o) => { setExpenseOpen(o); if (!o) setEditExpense(null); }}>
                          <DialogTrigger asChild>
                            <Button size="icon" variant="ghost"
                              onClick={() => { setEditExpense(e); setExpenseOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>تعديل مصروف</DialogTitle></DialogHeader>
                            <ExpenseForm initial={e} onDone={() => { setExpenseOpen(false); setEditExpense(null); }} />
                          </DialogContent>
                        </Dialog>
                        <RepeatBtn row={e} />
                        <DeleteBtn onDelete={() => deleteExpense(e.id)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      {/* ── Campaigns Tab ── */}
      <TabsContent value="campaigns">
        {/* التكامل مع Meta + الجدول الموحّد — الإدخال اليدوي يظهر داخله بوسم «يدوي»
            مع أدوات تعديل/حذف، فلا حاجة لجدول منفصل مكرر */}
        <AdSpendSection products={products} />
      </TabsContent>
    </Tabs>
  );
}
