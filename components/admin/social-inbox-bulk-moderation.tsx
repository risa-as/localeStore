"use client";

import { useState } from "react";
import { EyeOff, Loader2, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { InboxItem, SocialPlatform } from "@/lib/meta/inbox";

export type BulkModerationState = { action: "hide" | "delete"; total: number; done: number; failed: number; running: boolean; result?: string };

/**
 * Hide or delete every comment in the current filter (e.g. all comments that run
 * the product down). Hiding is the safe default: the commenter and their friends
 * still see it, so they do not notice, and it can be undone.
 */
export default function SocialInboxBulkModeration({ items, label, platform, state, disabled, onRun, onCancel, onDismiss }: {
  items: InboxItem[]; label: string; platform: SocialPlatform; state: BulkModerationState | null; disabled: boolean;
  onRun: (action: "hide" | "delete", items: InboxItem[]) => void; onCancel: () => void; onDismiss: () => void;
}) {
  const [action, setAction] = useState<"hide" | "delete" | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const candidates = action === "hide" ? items.filter(item => !item.hidden) : items;
  const chosen = candidates.filter(item => !excluded.has(item.id));
  const visibleCount = items.filter(item => !item.hidden).length;
  const where = platform === "instagram" ? "إنستغرام" : "فيسبوك";

  return <>
    {state ? <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs" role="status">
      {state.running && <Loader2 className="size-3.5 animate-spin" />}
      <span className="font-semibold">{state.action === "hide" ? "إخفاء" : "حذف"} «{label}»: {state.done}/{state.total}</span>
      {state.failed > 0 && <span className="text-destructive">تعذّر {state.failed}</span>}
      {state.result && <span>{state.result}</span>}
      {state.running ? <Button size="sm" variant="outline" className="h-6 ms-auto gap-1" onClick={onCancel}><Square className="size-3" />إيقاف</Button>
        : <button type="button" className="ms-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="إغلاق النتيجة" onClick={onDismiss}><X className="size-3.5" /></button>}
    </div> : null}
    {!state?.running && items.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">لكل «{label}» المعروضة:</span>
      <Button size="sm" variant="outline" className="h-7 gap-1 px-2" disabled={disabled || visibleCount === 0} onClick={() => { setExcluded(new Set()); setAction("hide"); }}>
        <EyeOff className="size-3.5" />إخفاء الكل ({visibleCount})
      </Button>
      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-destructive" disabled={disabled} onClick={() => { setExcluded(new Set()); setAction("delete"); }}>
        <Trash2 className="size-3.5" />حذف الكل ({items.length})
      </Button>
    </div>}

    <Dialog open={!!action} onOpenChange={open => { if (!open) setAction(null); }}>
      <DialogContent dir="rtl" className="sm:max-w-lg max-h-[85dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{action === "hide" ? `إخفاء ${chosen.length} تعليقاً؟` : `حذف ${chosen.length} تعليقاً نهائياً؟`}</DialogTitle>
          <DialogDescription>
            {action === "hide"
              ? `يختفي التعليق عن باقي الناس، ويبقى ظاهراً لصاحبه وأصدقائه فلا يلاحظ. يمكن إظهاره لاحقاً من قائمة التعليق.`
              : `يُحذف من ${where} ولا يمكن استرجاعه، وقد يلاحظ صاحبه أن تعليقه اختفى. الإخفاء أهدأ ويؤدي الغرض نفسه.`}
            {" "}يشمل التعليقات المحمّلة فقط؛ اضغط «تحميل كل التعليقات» أولاً لتشمل الجميع. أزل العلامة عن أي تعليق تريد إبقاءه.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-auto rounded-md border divide-y">{candidates.map(item => <label key={item.id} className="flex items-start gap-2 p-2 text-xs">
          <Checkbox checked={!excluded.has(item.id)} onCheckedChange={value => setExcluded(prev => {
            const next = new Set(prev); if (value === true) next.delete(item.id); else next.add(item.id); return next; })} />
          <span className="min-w-0"><span className="font-semibold">{item.title}</span>: <span dir="auto">{item.text}</span></span>
        </label>)}</div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setAction(null)}>إلغاء</Button>
          <Button variant={action === "delete" ? "destructive" : "default"} disabled={!chosen.length}
            onClick={() => { if (action) onRun(action, chosen); setAction(null); }}>
            {action === "hide" ? `إخفاء ${chosen.length}` : `حذف ${chosen.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
