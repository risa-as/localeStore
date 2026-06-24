"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  createBatch,
  updateBatch,
  type BatchRow,
} from "@/lib/actions/batch.actions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Plus, Pencil, Layers } from "lucide-react";

export default function BatchForm({
  products,
  batch,
  presetProductId,
  compact = false,
}: {
  products: { id: string; name: string }[];
  batch?: BatchRow;
  presetProductId?: string;
  compact?: boolean;
}) {
  const isEdit = !!batch;
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [productId, setProductId] = useState(
    batch?.productId ?? presetProductId ?? "",
  );
  const [quantity, setQuantity] = useState(batch ? String(batch.quantity) : "");
  const [costPrice, setCostPrice] = useState(
    batch ? String(batch.costPrice) : "",
  );
  const [notes, setNotes] = useState(batch?.notes ?? "");

  const handleSubmit = () => {
    if (!productId) {
      toast({ variant: "destructive", description: "يرجى اختيار المنتج" });
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast({ variant: "destructive", description: "يرجى إدخال كمية صحيحة" });
      return;
    }
    startTransition(async () => {
      const payload = {
        productId,
        quantity: Number(quantity),
        costPrice: costPrice || "0",
        notes: notes || null,
      };
      const res = isEdit
        ? await updateBatch({ ...payload, id: batch!.id })
        : await createBatch(payload);
      if (!res.success) {
        toast({ variant: "destructive", description: res.message });
      } else {
        toast({ description: res.message });
        setOpen(false);
        if (!isEdit) {
          setQuantity("");
          setCostPrice("");
          setNotes("");
        }
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="icon" variant="ghost" title="تعديل">
            <Pencil className="w-4 h-4" />
          </Button>
        ) : compact ? (
          <Button size="icon" variant="ghost" title="إضافة دفعة">
            <Layers className="w-4 h-4" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            إضافة دفعة
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل دفعة" : "إضافة دفعة"}</DialogTitle>
          <DialogDescription>
            بيانات الدفعة تُستخدم لاحتساب التكلفة حسب الدفعات (الأقدم شراءً
            أولاً).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>المنتج</Label>
            <Select
              value={productId}
              onValueChange={setProductId}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر المنتج" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الكمية</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>تكلفة الوحدة</Label>
              <Input
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              className="resize-none"
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending
              ? "جاري الحفظ..."
              : isEdit
                ? "حفظ التعديل"
                : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
