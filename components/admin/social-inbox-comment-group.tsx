"use client";

import { Button } from "@/components/ui/button";
import ItemBody from "./social-inbox-item";
import type { CommentGroup } from "@/lib/meta/inbox-workflow";
import type { InboxItem } from "@/lib/meta/inbox";

export default function SocialInboxCommentGroup({ group, targetId, handled, disabled, onReply, onThread }: {
  group: CommentGroup; targetId?: string; handled: Set<string>; disabled: boolean;
  onReply: (item: InboxItem) => void; onThread: (item: InboxItem) => void;
}) {
  const repeated = group.items.length > 1;
  return <div className={`rounded-xl border bg-background overflow-hidden ${repeated ? "border-primary/20" : ""}`} role="group" aria-label={repeated ? `تعليقات ${group.items[0].title} على المنشور` : `تعليق ${group.items[0].title}`}>
    {repeated && <div className="px-3 py-2 bg-muted/40 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">{group.items[0].title}</span><span className="rounded-full border bg-background px-2 py-0.5">{group.items.length} تعليقات على المنشور نفسه</span><span className="text-muted-foreground">راجعها معاً قبل الرد</span></div>}
    <div className="divide-y">{group.items.map(item => <div key={item.id} className={`p-3 ${targetId === item.id ? "bg-primary/5 ring-1 ring-inset ring-primary" : ""}`}>
      <ItemBody item={item} compact />
      <div className="flex flex-wrap items-center gap-2 mt-2"><Button disabled={disabled} size="sm" variant="outline" onClick={() => onReply(item)}>ردّ على التعليق</Button><Button disabled={disabled} size="sm" variant="ghost" onClick={() => onThread(item)}>عرض الردود</Button>
        {handled.has(item.id) && <span className="text-[11px] text-emerald-700 dark:text-emerald-400">تم الرد في هذه الجلسة</span>}
      </div>
    </div>)}</div>
  </div>;
}
