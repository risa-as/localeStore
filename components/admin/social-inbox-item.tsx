"use client";

import { useState, type SyntheticEvent } from "react";
import Image from "next/image";
import { ExternalLink, MessageCircle, Check, CheckCheck, Clock3, Loader2, AlertCircle } from "lucide-react";
import type { InboxItem } from "@/lib/meta/inbox";

const date = (value: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" }) : "";

export default function SocialInboxItem({ item, compact = false, hideCommentLink = false }: { item: InboxItem; compact?: boolean; hideCommentLink?: boolean }) {
  return <>
    <div className={`text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ${compact ? "text-[10px] mb-1" : "text-xs mb-2"}`}>
      <span>{item.system ? "إشعار من فيسبوك" : item.outgoing ? "أنت" : item.title}</span><time dateTime={item.time || undefined}>{date(item.time)}</time>
    </div>
    {item.system && <h3 className="font-medium text-sm flex items-center gap-2 mb-2"><MessageCircle className="size-4" />محادثة بدأت من تعليق</h3>}
    {item.text && <p dir="auto" data-inbox-customer-text={!item.outgoing && !item.system ? item.id : undefined} className="text-sm whitespace-pre-wrap break-words leading-6">{item.text}</p>}
    {item.commentUrl && !hideCommentLink && <a href={item.commentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm mt-3">عرض التعليق <ExternalLink className="size-3" /></a>}
    {item.attachments?.map(attachment => <MediaAttachment key={attachment.url} attachment={attachment} />)}
    {item.outgoing && item.deliveryStatus && <div role="status" className={`mt-1 flex items-center gap-1 text-[10px] ${item.deliveryStatus === "read" ? "text-sky-600 dark:text-sky-400" : ["failed", "uncertain"].includes(item.deliveryStatus) ? "text-destructive" : "text-muted-foreground"}`}>
      {item.deliveryStatus === "queued" ? <><Clock3 className="size-3" />بانتظار الإرسال</>
        : item.deliveryStatus === "sending" ? <><Loader2 className="size-3 animate-spin" />جارٍ الإرسال</>
        : item.deliveryStatus === "sent" ? <><Check className="size-3" />تم الإرسال</>
        : item.deliveryStatus === "delivered" ? <><CheckCheck className="size-3" />تم التسليم</>
        : item.deliveryStatus === "read" ? <><CheckCheck className="size-3" />تمت القراءة</>
        : <><AlertCircle className="size-3 shrink-0" /><span>{item.deliveryStatus === "failed" ? "فشل الإرسال" : "الإرسال غير مؤكد"}{item.sendError ? `: ${item.sendError}` : ""}</span></>}
    </div>}
    {item.outgoing && item.deliveryStatus === "failed" && /\(551(?:\/\d+)?\)/.test(item.sendError || "") &&
      <a href="https://business.facebook.com/latest/inbox/all" target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
        فتح صندوق Meta <ExternalLink aria-hidden="true" className="size-3" />
      </a>}
  </>;
}

function MediaAttachment({ attachment }: { attachment: NonNullable<InboxItem["attachments"]>[number] }) {
  const [broken, setBroken] = useState(false);
  const sticker = attachment.kind === "sticker";
  if (attachment.kind === "audio" || attachment.kind === "video") {
    const audio = attachment.kind === "audio";
    return <div className={`mt-2 min-w-0 max-w-full space-y-2 ${audio ? "w-80" : "w-[480px]"}`}>
      <p className="text-xs text-muted-foreground">{audio ? "رسالة صوتية" : "فيديو مرفق"}</p>
      {!broken && (audio
        ? <audio aria-label="تشغيل الرسالة الصوتية" dir="ltr" controls preload="none" src={attachment.url}
          onPlay={pauseOtherMedia} onError={() => setBroken(true)} className="w-full max-w-full" />
        : <video aria-label="تشغيل الفيديو المرفق" dir="ltr" controls playsInline preload="none" src={attachment.url}
          onPlay={pauseOtherMedia} onError={() => setBroken(true)} className="w-full max-h-80 rounded-lg bg-black object-contain" />)}
      {broken && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">تعذر تشغيل {audio ? "الصوت" : "الفيديو"}. جرّب فتح الملف، أو حدّث المحادثة لتجديد رابط Meta.</p>}
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
        {audio ? "فتح الملف الصوتي" : "فتح الفيديو"} <ExternalLink className="size-3" />
      </a>
    </div>;
  }
  if (!broken && (sticker || attachment.kind === "image")) return <a href={attachment.url} target="_blank" rel="noopener noreferrer"
    aria-label={sticker ? "فتح الملصق" : "فتح الصورة"} className="block w-fit max-w-full mt-2">
    <Image src={attachment.url} alt={sticker ? "ملصق" : "صورة مرفقة"} unoptimized loading="lazy" referrerPolicy="no-referrer"
      width={dimension(attachment.width, sticker ? 128 : 480)} height={dimension(attachment.height, sticker ? 128 : 360)}
      onError={() => setBroken(true)} className={sticker ? "size-32 object-contain" : "max-h-80 max-w-full h-auto w-auto rounded-lg object-contain"} />
  </a>;
  return <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block text-sm underline mt-2">
    {sticker ? "عرض الملصق" : attachment.kind === "image" ? "عرض الصورة" : attachment.name} <ExternalLink className="inline size-3" />
  </a>;
}

function pauseOtherMedia(event: SyntheticEvent<HTMLMediaElement>) {
  const current = event.currentTarget;
  current.closest("[data-social-inbox]")?.querySelectorAll<HTMLMediaElement>("audio,video").forEach(media => {
    if (media !== current && !media.paused) media.pause();
  });
}

function dimension(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(4096, Math.round(value)) : fallback;
}
