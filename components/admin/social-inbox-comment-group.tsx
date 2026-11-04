"use client";

import { inboxDate } from "@/lib/meta/inbox-date";
import { useEffect, useRef, useState } from "react";
import { Ban, CheckCheck, ChevronDown, Eye, EyeOff, Loader2, Lock, MessagesSquare, MoreHorizontal, Reply, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import SocialInboxOrder from "./social-inbox-order";
import type { CommentGroup } from "@/lib/meta/inbox-workflow";
import type { InboxItem, SocialPlatform } from "@/lib/meta/inbox";
import { expandCommentReply, matchCommentReply, type CommentReply } from "@/lib/meta/comment-replies";
import { COMMENT_INTENTS, type CommentIntent } from "@/lib/meta/comment-intent";
import type { InboxProduct } from "@/lib/meta/inbox-tools";

export type CommentAction = "hide" | "unhide" | "delete" | "block";

type Pending = { item: InboxItem; action: "delete" | "block" };

const INTENT_STYLE: Partial<Record<CommentIntent, string>> = {
  order: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  price: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  booking: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  question: "bg-amber-500/20 text-amber-900 dark:text-amber-300",
  followup: "bg-orange-500/20 text-orange-900 dark:text-orange-300",
  complaint: "bg-red-500/15 text-red-800 dark:text-red-300",
};
const intentLabel = (intent: CommentIntent) => COMMENT_INTENTS.find(item => item.value === intent)?.label ?? "";
const when = (value: string) => inboxDate(value);

/** The replies under the open comment, shown inside its card. */
export type CommentThread = { id: string; items: InboxItem[]; after: string | null; loading: boolean; error: string };

export default function SocialInboxCommentGroup({ group, platform, pageId, postHandle, targetId, handled, disabled, moderatingId, replies, product, sendingId, onQuickReply, onReply, onThread, onModerate, onOrdered, onWorking, thread, onCloseThread, onMoreReplies }: {
  thread: CommentThread | null; onCloseThread: () => void; onMoreReplies: () => void;
  group: CommentGroup; platform: SocialPlatform; pageId: string; postHandle: string; targetId?: string; handled: Set<string>; disabled: boolean; moderatingId?: string | null;
  /** An order was registered from this comment. */
  onOrdered: (item: InboxItem) => void; onWorking: (working: boolean) => void;
  replies: CommentReply[]; product: InboxProduct | null; /** `${commentId}:${replyId}` being sent */ sendingId?: string | null;
  /** One click: send this reply (private first if it has one) and move to the next comment. */
  onQuickReply: (item: InboxItem, reply: CommentReply) => void;
  onReply: (item: InboxItem) => void; onThread: (item: InboxItem) => void;
  /** `alsoDelete` lists more of this author's comments to delete after a block. */
  onModerate: (item: InboxItem, action: CommentAction, alsoDelete?: InboxItem[]) => void;
}) {
  const repeated = group.items.length > 1;
  const [pending, setPending] = useState<Pending | null>(null);
  const [deleteAll, setDeleteAll] = useState(true);
  const authorComments = group.items.filter(item => !item.outgoing);
  const targetRef = useRef<HTMLDivElement>(null);
  const hasTarget = group.items.some(item => item.id === targetId);
  useEffect(() => { if (hasTarget) targetRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [hasTarget, targetId]);

  function confirm() {
    if (!pending) return;
    if (pending.action === "delete") onModerate(pending.item, "delete");
    else onModerate(pending.item, "block", deleteAll ? authorComments : []);
    setPending(null);
  }

  return <div className={`rounded-xl border border-border/60 bg-background shadow-sm ${repeated ? "border-primary/25" : ""}`} role="group" aria-label={repeated ? `تعليقات ${group.items[0].title} على المنشور` : `تعليق ${group.items[0].title}`}>
    {repeated && <div className="rounded-t-xl px-3 py-2 bg-muted/40 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">{group.items[0].title}</span><span className="rounded-full border bg-background px-2 py-0.5">{group.items.length} تعليقات على المنشور نفسه</span><span className="text-muted-foreground">راجعها معاً قبل الرد</span></div>}
    <div className="divide-y divide-border/60">{group.items.map(item => {
      const suggested = item.outgoing ? null : matchCommentReply(item.text, replies, item.intent);
      // Suggested reply first, then the next three; the rest stay in «ردود أخرى».
      const ordered = suggested ? [suggested, ...replies.filter(reply => reply.id !== suggested.id)] : replies;
      const shown = ordered.slice(0, 4), more = ordered.slice(4);
      const threadOpen = thread?.id === item.id;
      const replyButton = (reply: CommentReply, asMenuItem = false) => {
        const expanded = expandCommentReply(reply, item.title, product);
        const isSuggested = suggested?.id === reply.id;
        const blocked = disabled || expanded.missing.length > 0;
        const title = expanded.missing.length ? `يحتاج ${expanded.missing.join("، ")} — اختر منتج المنشور`
          : [expanded.privateText && `رسالة خاصة:\n${expanded.privateText}`, expanded.publicText && `رد علني:\n${expanded.publicText}`].filter(Boolean).join("\n\n");
        const icon = sendingId === `${item.id}:${reply.id}` ? <Loader2 className="size-3 animate-spin" />
          : isSuggested ? <Sparkles className="size-3" /> : reply.privateText.trim() ? <Lock className="size-3" /> : null;
        if (asMenuItem) return <DropdownMenuItem key={reply.id} disabled={blocked} title={title} onSelect={() => onQuickReply(item, reply)}>{icon}{reply.label}</DropdownMenuItem>;
        return <Button key={reply.id} size="sm" variant={isSuggested ? "default" : "outline"} title={title} disabled={blocked}
          className={`h-7 gap-1 rounded-full px-3 text-xs ${isSuggested ? "shadow-sm" : "bg-background"}`} onClick={() => onQuickReply(item, reply)}>
          {icon}{reply.label}
        </Button>;
      };
      return <div key={item.id} ref={targetId === item.id ? targetRef : undefined}
        className={`relative p-3 space-y-2.5 transition-colors first:rounded-t-xl last:rounded-b-xl ${targetId === item.id ? "bg-primary/[0.04]" : ""}`}>
        {targetId === item.id && <span aria-hidden="true" className="absolute inset-y-3 start-0 w-1 rounded-full bg-primary/70" />}
        {/* Header: who, when, and what the comment is about */}
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.outgoing ? "bg-emerald-600 text-white" : "bg-muted text-foreground"}`}>
            {(item.outgoing ? "ص" : item.title.trim()[0] || "ز")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold">{item.outgoing ? "الصفحة" : item.title}</span>
              <time className="text-[11px] text-muted-foreground" dateTime={item.time || undefined}>{when(item.time)}</time>
              {item.intent && item.intent !== "other" && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${INTENT_STYLE[item.intent] || "bg-muted text-muted-foreground"}`}>{intentLabel(item.intent)}</span>}
              {item.ordered && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">سُجّل الطلب</span>}
              {(item.answered || handled.has(item.id)) && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400"><CheckCheck className="size-3" />تم الرد</span>}
              {item.hidden && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title="لا يراه إلا صاحبه وأصدقاؤه والصفحة"><EyeOff className="size-3" />مخفي</span>}
            </div>
            <p dir="auto" className={`mt-1 whitespace-pre-wrap break-words text-[15px] leading-7 ${item.hidden ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}`}>{item.text}</p>
          </div>
        </div>

        {/* One-click replies */}
        {!item.outgoing && replies.length > 0 && <div className="ms-10 flex flex-wrap items-center gap-1.5" role="group" aria-label="ردود بنقرة واحدة">
          {shown.map(reply => replyButton(reply))}
          {more.length > 0 && <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-7 gap-1 rounded-full px-3 text-xs" disabled={disabled}>ردود أخرى ({more.length})<ChevronDown className="size-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">{more.map(reply => replyButton(reply, true))}</DropdownMenuContent>
          </DropdownMenu>}
        </div>}

        {/* Actions */}
        <div className="ms-10 flex flex-wrap items-center gap-1.5">
          <Button disabled={disabled} size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => onReply(item)}><Reply className="size-3.5" />ردّ بنص خاص</Button>
          <Button disabled={disabled} size="sm" variant={threadOpen ? "secondary" : "ghost"} className="h-7 gap-1 px-2 text-xs"
            onClick={() => threadOpen ? onCloseThread() : onThread(item)}>
            <MessagesSquare className="size-3.5" />{threadOpen ? "إخفاء الردود" : "الردود"}
          </Button>
          {!item.outgoing && item.intent === "order" && <SocialInboxOrder scope={{ pageId, platform, handle: item.handle }} source={{ kind: "comment", postHandle }}
            suggestedProduct={product || undefined} disabled={disabled} onWorking={onWorking} onApproved={() => onOrdered(item)} />}
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button disabled={disabled} size="sm" variant="ghost" className="h-7 px-2" aria-label="إدارة التعليق">
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
        </div>

        {/* The conversation under this comment */}
        {threadOpen && <div className="ms-10 space-y-2 border-s-2 border-border ps-3" aria-label={`ردود على تعليق ${item.title}`}>
          {thread.loading && !thread.items.length ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />جارٍ تحميل الردود…</p>
            : thread.items.length ? thread.items.map(reply => <div key={reply.id}
              className={`w-fit max-w-[92%] rounded-2xl rounded-ss-sm px-3 py-2 ${reply.outgoing
                ? "bg-emerald-50 dark:bg-emerald-950/40"
                : "bg-muted/60"}`}>
              <div className="mb-0.5 flex items-center gap-2 text-[11px]">
                <span className={`font-semibold ${reply.outgoing ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{reply.outgoing ? "الصفحة" : reply.title}</span>
                <time className="text-muted-foreground" dateTime={reply.time || undefined}>{when(reply.time)}</time>
              </div>
              <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-6">{reply.text}</p>
            </div>)
            : <p className="text-xs text-muted-foreground">لا توجد ردود بعد على هذا التعليق.</p>}
          {thread.error && <p role="alert" className="text-xs text-destructive">{thread.error}</p>}
          {thread.after && <Button disabled={thread.loading || disabled} variant="ghost" size="sm" className="h-7 text-xs" onClick={onMoreReplies}>تحميل ردود أقدم</Button>}
        </div>}
      </div>; })}</div>

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
