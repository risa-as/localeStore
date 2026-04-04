"use client";

import { useState, useTransition } from "react";
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2, Megaphone, Receipt, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createExpense, updateExpense, deleteExpense,
  createAdCampaign, updateAdCampaign, deleteAdCampaign,
} from "@/lib/actions/expense.actions";

const EXPENSE_CATEGORIES = [
  { value: "rent",      label: "إيجار" },
  { value: "salary",    label: "رواتب موظفين" },
  { value: "utilities", label: "فواتير (كهرباء / إنترنت)" },
  { value: "transport", label: "نقل وتوصيل" },
  { value: "other",     label: "أخرى" },
];

const CURRENCIES = [
  { value: "IQD", label: "دينار عراقي" },
  { value: "USD", label: "دولار أمريكي" },
];

function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// ─── Expense Form ─────────────────────────────────────────────────────────────
function ExpenseForm({
  initial,
  onDone,
}: {
  initial?: any;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  const [form, setForm] = useState({
    category:    initial?.category    ?? "rent",
    description: initial?.description ?? "",
    fromDate:    initial?.fromDate    ? initial.fromDate.toISOString().split("T")[0] : "",
    toDate:      initial?.toDate      ? initial.toDate.toISOString().split("T")[0]   : "",
    amount:      initial?.amount      ? String(initial.amount) : "",
    notes:       initial?.notes       ?? "",
  });

  const submit = () => {
    start(async () => {
      const res = initial
        ? await updateExpense(initial.id, form as any)
        : await createExpense(form as any);
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

// ─── Ad Campaign Form ──────────────────────────────────────────────────────────
function AdCampaignForm({
  initial,
  products,
  onDone,
}: {
  initial?: any;
  products: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  const [comboOpen, setComboOpen] = useState(false);
  const [form, setForm] = useState({
    productId: initial?.productId ?? (products[0]?.id ?? ""),
    fromDate:  initial?.fromDate  ? initial.fromDate.toISOString().split("T")[0] : "",
    toDate:    initial?.toDate    ? initial.toDate.toISOString().split("T")[0]   : "",
    amount:    initial?.amount    ? String(initial.amount) : "",
    currency:  initial?.currency  ?? "IQD",
    notes:     initial?.notes     ?? "",
  });

  const selectedProduct = products.find((p) => p.id === form.productId);

  const submit = () => {
    start(async () => {
      const res = initial
        ? await updateAdCampaign(initial.id, form as any)
        : await createAdCampaign(form as any);
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
        <label className="text-sm font-medium">المنتج</label>
        <Popover open={comboOpen} onOpenChange={setComboOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboOpen}
              className="w-full mt-1 justify-between font-normal"
            >
              <span className="truncate">
                {selectedProduct ? selectedProduct.name : "اختر منتجاً..."}
              </span>
              <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50 ms-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput placeholder="ابحث عن منتج..." />
              <CommandList>
                <CommandEmpty>لا توجد نتائج</CommandEmpty>
                <CommandGroup>
                  {products.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.name}
                      onSelect={() => {
                        setForm({ ...form, productId: p.id });
                        setComboOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "me-2 w-4 h-4",
                          form.productId === p.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {p.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">المبلغ</label>
          <Input className="mt-1" type="number" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-medium">العملة</label>
          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
function DeleteBtn({ onDelete }: { onDelete: () => Promise<any> }) {
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

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ExpensesClient({
  expenses,
  campaigns,
  products,
}: {
  expenses: any[];
  campaigns: any[];
  products: { id: string; name: string }[];
}) {
  const [expenseOpen, setExpenseOpen]   = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editExpense,  setEditExpense]  = useState<any>(null);
  const [editCampaign, setEditCampaign] = useState<any>(null);

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
        <div className="flex justify-end mb-4">
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
              <ExpenseForm initial={editExpense} onDone={() => setExpenseOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {expenses.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">لا توجد مصاريف مسجلة</p>
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
                {expenses.map((e, index) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-center text-muted-foreground text-sm">{index + 1}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{categoryLabel(e.category)}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{e.description}</TableCell>
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
        <div className="flex justify-end mb-4">
          <Dialog open={campaignOpen} onOpenChange={(o) => { setCampaignOpen(o); if (!o) setEditCampaign(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditCampaign(null)}>
                <Plus className="w-4 h-4 mr-2" /> إضافة حملة
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editCampaign ? "تعديل حملة" : "إضافة حملة إعلانية"}</DialogTitle>
              </DialogHeader>
              <AdCampaignForm initial={editCampaign} products={products} onDone={() => setCampaignOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {campaigns.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">لا توجد حملات إعلانية مسجلة</p>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>المنتج</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead>العملة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c, index) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-center text-muted-foreground text-sm">{index + 1}</TableCell>
                    <TableCell className="font-medium">{c.product.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(c.fromDate).toLocaleDateString("ar-IQ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(c.toDate).toLocaleDateString("ar-IQ")}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {(Number(c.amount) * 1000).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.currency}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Dialog open={editCampaign?.id === c.id && campaignOpen}
                          onOpenChange={(o) => { setCampaignOpen(o); if (!o) setEditCampaign(null); }}>
                          <DialogTrigger asChild>
                            <Button size="icon" variant="ghost"
                              onClick={() => { setEditCampaign(c); setCampaignOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>تعديل حملة</DialogTitle></DialogHeader>
                            <AdCampaignForm initial={c} products={products} onDone={() => { setCampaignOpen(false); setEditCampaign(null); }} />
                          </DialogContent>
                        </Dialog>
                        <DeleteBtn onDelete={() => deleteAdCampaign(c.id)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
