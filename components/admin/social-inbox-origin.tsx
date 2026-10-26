"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSocialInboxOrigin } from "@/lib/actions/social-inbox.actions";
import type { InboxOrigin, SocialPlatform } from "@/lib/meta/inbox";
import { money, type InboxProduct } from "@/lib/meta/inbox-tools";
import ItemBody from "./social-inbox-item";

export default function SocialInboxOrigin({ pageId, platform, handle, messageId, disabled, onProduct }: {
  pageId: string; platform: SocialPlatform; handle: string; messageId: string; disabled: boolean; onProduct: (product: InboxProduct) => void;
}) {
  const [origin, setOrigin] = useState<InboxOrigin | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getSocialInboxOrigin({ pageId, platform, handle, messageId }).then(result => {
      if (!active) return;
      if (result.ok) { setOrigin(result.data); if (!result.data) setError("لم تتوفر بيانات المصدر لهذا الإشعار."); }
      else setError(result.message);
    }).catch(() => { if (active) setError("تعذر جلب مصدر التعليق؛ أعد المحاولة."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pageId, platform, handle, messageId, retry]);
  const image = origin?.post?.attachments?.find(item => item.kind === "image")?.url;
  return <div className="mt-3 rounded-lg border bg-background p-3 min-w-0 space-y-3" role="region" aria-label="تفاصيل المنشور والتعليق">
    {loading ? <p role="status" className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="size-3 animate-spin" />جارٍ التعرف على المنشور والمنتج…</p>
      : error ? <div className="flex items-center gap-2"><p role="status" className="text-xs text-muted-foreground flex-1">{error}</p><Button size="sm" variant="ghost" disabled={disabled} onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}><RefreshCw className="size-3" />إعادة</Button></div>
      : origin && <>
      {origin?.products?.map(item => <div key={item.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
        {item.image && !image && <Image unoptimized src={item.image} alt="" width={56} height={56} className="size-14 rounded-md object-cover" />}
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{money(item.price)} · المتاح {item.available}</p></div>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onProduct(item)}>اختيار للحجز</Button>
      </div>)}
      {origin.post ? <div className="space-y-2"><h4 className="text-xs font-semibold text-muted-foreground">المنشور الذي علّق عليه الزبون</h4>
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          {image && <Image unoptimized src={image} alt="صورة المنشور الأصلي" width={192} height={144} className="w-full sm:w-36 h-36 object-contain rounded-md bg-muted/30 shrink-0" />}
          <p dir="auto" className="text-sm whitespace-pre-wrap break-words leading-6 min-w-0 flex-1">{origin.post.text}</p>
        </div></div>
        : <p className="text-xs text-amber-700 dark:text-amber-400">تعذر جلب المنشور؛ قد يكون محذوفاً أو غير متاح لصلاحيات التطبيق. لن نخمن المنتج المقصود.</p>}
      {origin && <div className="border-s-2 ps-3 space-y-2"><h3 className="text-sm font-semibold">تعليق الزبون</h3><ItemBody item={origin.comment} /></div>}
      {origin?.comment.url && <a className="text-xs text-muted-foreground underline inline-flex items-center gap-1" href={origin.comment.url} target="_blank" rel="noopener noreferrer">فتح المصدر في فيسبوك <ExternalLink className="size-3" /></a>}
      </>}
  </div>;
}
