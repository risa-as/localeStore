"use client";

import { useState } from "react";
import { Ban, Eye, EyeOff, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ItemBody from "./social-inbox-item";
import type { CommentGroup } from "@/lib/meta/inbox-workflow";
import type { InboxItem, SocialPlatform } from "@/lib/meta/inbox";

export type CommentAction = "hide" | "unhide" | "delete" | "block";

type Pending = { item: InboxItem; action: "delete" | "block" };

export default function SocialInboxCommentGroup({ group, platform, targetId, handled, disabled, moderatingId, onReply, onThread, onModerate }: {
  group: CommentGroup; platform: SocialPlatform; targetId?: string; handled: Set<string>; disabled: boolean; moderatingId?: string | null;
  onReply: (item: InboxItem) => void; onThread: (item: InboxItem) => void;
  /** `alsoDelete` lists more of this author's comments to delete after a block. */
  onModerate: (item: InboxItem, action: CommentAction, alsoDelete?: InboxItem[]) => void;
}) {
  const repeated = group.items.length > 1;
  const [pending, setPending] = useState<Pending | null>(null);
  const [deleteAll, setDeleteAll] = useState(true);
  const authorComments = group.items.filter(item => !item.outgoing);

  function confirm() {
    if (!pending) return;
    if (pending.action === "delete") onModerate(pending.item, "delete");
    else onModerate(pending.item, "block", deleteAll ? authorComments : []);
    setPending(null);
  }

  return <div className={`rounded-xl border bg-background overflow-hidden ${repeated ? "border-primary/20" : ""}`} role="group" aria-label={repeated ? `تعليقات ${group.items[0].title} على المنشور` : `تعليق ${group.items[0].title}`}>
    {repeated && <div className="px-3 py-2 bg-muted/40 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">{group.items[0].title}</span><span className="rounded-full border bg-background px-2 py-0.5">{group.items.length} تعليقات على المنشور نفسه</span><span className="text-muted-foreground">راجعها معاً قبل الرد</span></div>}
    <div className="divide-y">{group.items.map(item => <div key={item.id} className={`p-3 ${targetId === item.id ? "bg-primary/5 ring-1 ring-inset ring-primary" : ""}`}>
      <div className={item.hidden ? "opacity-60" : undefined}><ItemBody item={item} compact /></div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Button disabled={disabled} size="sm" variant="outline" onClick={() => onReply(item)}>ردّ على التعليق</Button>
        <Button disabled={disabled} size="sm" variant="ghost" onClick={() => onThread(item)}>عرض الردود</Button>
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button disabled={disabled} size="sm" variant="ghost" className="px-2" aria-label="إدارة التعليق">
              {moderatingId === item.id ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {!item.outgoing && (item.hidden
              ? <DropdownMenuItem onSelect={() => onModerate(item, "unhide")}><Eye className="size-4" />إظهار التعليق</DropdownMenuItem>
              : <DropdownMenuItem onSelect={() => onModerate(item, "hide")}><EyeOff className="size-4" />إخفاء التعليق</DropdownMenuItem>)}
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPending({ item, action: "delete" })}><Trash2 className="size-4" />حذف التعليق</DropdownMenuItem>
            {!item.outgoing && platform === "facebook" && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { setDeleteAll(true); setPending({ item, action: "block" }); }}><Ban className="size-4" />حظر {item.title} من الصفحة</DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
        {item.hidden && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title="لا يراه إلا صاحبه وأصدقاؤه والصفحة"><EyeOff className="size-3" />مخفي</span>}
        {handled.has(item.id) && <span className="text-[11px] text-emerald-700 dark:text-emerald-400">تم الرد في هذه الجلسة</span>}
      </div>
    </div>)}</div>

    <Dialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.action === "block" ? `حظر ${pending.item.title}؟` : "حذف التعليق نهائياً؟"}</DialogTitle>
          <DialogDescription>
            {pending?.action === "block"
              ? "لن يستطيع التعليق على منشورات الصفحة أو مراسلتها. يمكن إلغاء الحظر لاحقاً من إعدادات الصفحة في فيسبوك."
              : `سيُحذف من ${platform === "instagram" ? "إنستغرام" : "فيسبوك"} ولا يمكن استرجاعه. لإبعاده عن الزبائن دون حذفه استخدم «إخفاء التعليق».`}
          </DialogDescription>
        </DialogHeader>
        {pending && <p dir="auto" className="rounded-lg border bg-muted/30 p-2 text-sm line-clamp-3">{pending.item.text}</p>}
        {pending?.action === "block" && <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={deleteAll} onCheckedChange={value => setDeleteAll(value === true)} />
          احذف أيضاً تعليقاته على هذا المنشور ({authorComments.length})
        </label>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setPending(null)}>إلغاء</Button>
          <Button variant="destructive" onClick={confirm}>{pending?.action === "block" ? "حظر" : "حذف"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
