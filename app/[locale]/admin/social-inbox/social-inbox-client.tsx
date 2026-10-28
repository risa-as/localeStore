"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, MessagesSquare, RefreshCw, Send, Loader2, ExternalLink, ArrowRight, SkipForward, PanelLeft, X, ChevronDown, Settings2, Search, MoreHorizontal, SlidersHorizontal, Paperclip } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getSocialInboxList, getSocialInboxDetail, getSocialInboxDelivery, replyToSocialInbox, sendSocialInboxMedia, markSocialInboxRead,
  type getSocialInboxSetup } from "@/lib/actions/social-inbox.actions";
import type { InboxItem, InboxPage, InboxReplyWindow, SocialPlatform } from "@/lib/meta/inbox";
import { reconcileConversation, type ConversationReceipt } from "@/lib/meta/inbox-state";
import ItemBody from "@/components/admin/social-inbox-item";
import SocialInboxTools from "@/components/admin/social-inbox-tools";
import SocialInboxOrigin from "@/components/admin/social-inbox-origin";
import SocialInboxOrder from "@/components/admin/social-inbox-order";
import { nextAwaiting, groupQuickReplies, expandQuickReply, type InboxProduct } from "@/lib/meta/inbox-tools";
import { useSocialQuickReplies } from "@/components/admin/use-social-quick-replies";
import { useUploadThing } from "@/lib/uploadthing";
import { INBOX_MEDIA_ACCEPT, inboxMediaKind, type UploadedInboxMedia } from "@/lib/meta/inbox-media";
import { useSocialOutbox, InboxSendFailure } from "@/components/admin/use-social-outbox";
import { advanceDelivery, mergeOutbox } from "@/lib/meta/inbox-outbox";
import { groupInboxComments, type SelectedOrderFields } from "@/lib/meta/inbox-workflow";
import SocialInboxSelection from "@/components/admin/social-inbox-selection";
import SocialInboxCommentGroup from "@/components/admin/social-inbox-comment-group";
import SocialInboxOrderLookup from "@/components/admin/social-inbox-order-lookup";
import SocialInboxConnectionCheck from "@/components/admin/social-inbox-connection-check";

type Setup = Awaited<ReturnType<typeof getSocialInboxSetup>>;
type Kind = "messages" | "comments";
type MediaDraft = { file: File; preview: string; uploaded?: UploadedInboxMedia };
type Detail = InboxPage & { window?: InboxReplyWindow | null };
const EMPTY: InboxPage = { items: [], after: null };
const date = (value: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" }) : "";
const merge = (old: InboxItem[], incoming: InboxItem[]) => [...new Map([...old, ...incoming].map(x => [x.id, x])).values()];

export default function SocialInboxClient({ setup }: { setup: Setup }) {
  const locale = useLocale();
  const [pageId, setPageId] = useState(setup.pages.find(page => page.id === setup.selectedPageId)?.id || setup.pages[0]?.id || "");
  const [platform, setPlatform] = useState<SocialPlatform>("facebook");
  const [kind, setKind] = useState<Kind>("messages");
  const [sending, setSending] = useState(false);
  const outbox = useSocialOutbox();
  // Drafts survive switching pages, platforms, posts and conversations.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bookingFields, setBookingFields] = useState<Record<string, SelectedOrderFields>>({});
  const page = setup.pages.find(p => p.id === pageId);
  return <div data-social-inbox dir="rtl" className="w-full flex flex-col gap-2 h-[calc(100dvh-5rem)] min-h-0">
    <div className="flex flex-wrap items-center gap-2 shrink-0 rounded-xl border bg-card px-3 py-2">
      <h1 className="text-sm font-bold flex items-center gap-2 me-auto"><MessagesSquare className="size-4 text-muted-foreground" />صندوق الصفحات</h1>
      {setup.connected && setup.configured && !!setup.pages.length && <>
        <span className="hidden xl:block text-xs text-muted-foreground max-w-44 truncate">{page?.name} · {platform === "facebook" ? "فيسبوك" : "إنستغرام"}</span>
        <div className="flex rounded-lg bg-muted p-1" role="group" aria-label="نوع المتابعة">
          <Button size="sm" className="h-7 shadow-none" aria-pressed={kind === "messages"} disabled={sending} variant={kind === "messages" ? "default" : "ghost"} onClick={() => setKind("messages")}>الرسائل</Button>
          <Button size="sm" className="h-7 shadow-none" aria-pressed={kind === "comments"} disabled={sending} variant={kind === "comments" ? "default" : "ghost"} onClick={() => setKind("comments")}>التعليقات</Button>
        </div>
      </>}
      <Popover><PopoverTrigger asChild><Button size="sm" variant="ghost" aria-label="إعدادات الصفحة والمنصة" title="الصفحة والمنصة والاتصال"><Settings2 className="size-4" /><span className="hidden sm:inline">الصفحة والمنصة</span></Button></PopoverTrigger>
        <PopoverContent dir="rtl" align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4">
          <p className="text-sm font-semibold">إعدادات الصندوق</p>
          {!!setup.pages.length && <><label className="block space-y-1 text-xs"><span>الصفحة</span><select aria-label="الصفحة" value={pageId} disabled={sending} onChange={e => { setPageId(e.target.value); setPlatform("facebook"); }} className="w-full rounded-md border bg-background p-2 text-sm">
            {setup.pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label><div className="flex gap-2" role="group" aria-label="المنصة">
            <Button size="sm" disabled={sending} aria-pressed={platform === "facebook"} variant={platform === "facebook" ? "default" : "outline"} onClick={() => setPlatform("facebook")}>فيسبوك</Button>
            <Button size="sm" disabled={sending || !page?.igId} aria-pressed={platform === "instagram"} variant={platform === "instagram" ? "default" : "outline"} onClick={() => setPlatform("instagram")}>إنستغرام</Button>
          </div>{!page?.igId && <p className="text-xs text-muted-foreground">إنستغرام يحتاج حساباً احترافياً مرتبطاً بالصفحة ومصرّحاً للتطبيق.</p>}</>}
          {!!pageId && setup.connected && setup.configured && <SocialInboxConnectionCheck key={`${pageId}:${platform}`} pageId={pageId} platform={platform} />}
          <Button asChild size="sm" variant="outline" className="w-full"><Link href={`/${locale}/admin/marketing`}>إعداد اتصال Meta <ExternalLink className="size-3" /></Link></Button>
        </PopoverContent>
      </Popover>
    </div>
    {!setup.connected || !setup.configured ? <div className="rounded-xl border bg-card p-7 space-y-3">
      <h2 className="font-semibold">أكمل ربط حساب Meta أولاً</h2><p className="text-muted-foreground text-sm">بعد الربط تظهر الصفحات المصرّح بها وحسابات إنستغرام الاحترافية المرتبطة بها هنا.</p>
      <p className="text-sm">رسائل الزبائن الفعليين تحتاج موافقة Meta على أذونات المراسلة. وجود التكوين وحده لا يمنحها.</p>
    </div> : setup.pages.length === 0 ? <div className="rounded-xl border p-7">لا توجد صفحات متاحة لهذا الاتصال. راجع صلاحيات الصفحات وأعد الربط.</div> : <>
      <Workspace key={`${pageId}:${platform}:${kind}`} userId={setup.userId} pageId={pageId} platform={platform} kind={kind} drafts={drafts}
        onDraft={(key, value) => setDrafts(prev => ({ ...prev, [key]: value }))} onSending={setSending} outbox={outbox}
        bookingFields={bookingFields} onBookingField={(key, field, value) => setBookingFields(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))} />
    </>}
  </div>;
}

function Workspace({ userId, pageId, platform, kind, drafts, onDraft, onSending, outbox, bookingFields, onBookingField }: {
  userId: string; pageId: string; platform: SocialPlatform; kind: Kind; drafts: Record<string, string>;
  onDraft: (key: string, value: string) => void; onSending: (value: boolean) => void;
  outbox: ReturnType<typeof useSocialOutbox>;
  bookingFields: Record<string, SelectedOrderFields>;
  onBookingField: (key: string, field: "phoneNumber" | "address", value: string) => void;
}) {
  const quickReplies = useSocialQuickReplies(userId);
  const generalReplies = groupQuickReplies(quickReplies.templates).general;
  const [list, setList] = useState<InboxPage>(EMPTY);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [detail, setDetail] = useState<Detail>(EMPTY);
  const [thread, setThread] = useState<InboxItem | null>(null);
  const [replies, setReplies] = useState<InboxPage>(EMPTY);
  const [target, setTarget] = useState<InboxItem | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [deliveryError, setDeliveryError] = useState("");
  const [notice, setNotice] = useState("");
  const [auto, setAuto] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [orderProducts, setOrderProducts] = useState<Record<string, InboxProduct | undefined>>({});
  const [mobileDetail, setMobileDetail] = useState(false);
  const [handledComments, setHandledComments] = useState<Set<string>>(new Set());
  const [mediaDrafts, setMediaDrafts] = useState<Record<string, MediaDraft>>({});
  const mediaDraftsRef = useRef<Record<string, MediaDraft>>({});
  const filePicker = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const { startUpload } = useUploadThing("inboxMediaUploader", { onUploadProgress: setUploadProgress });
  const alive = useRef(true);
  const detailSeq = useRef(0);
  const listSeq = useRef(0);
  const replySeq = useRef(0);
  const sendingNow = useRef(false);
  const receipts = useRef<Record<string, ConversationReceipt>>({});
  // A local read/send receipt is not confirmation of Meta's mark_seen action.
  const metaReadReceipts = useRef<Record<string, string>>({});
  const readRequests = useRef(new Map<string, Promise<void>>());
  const readSequences = useRef<Record<string, number>>({});
  const confirmedComments = useRef<Record<string, InboxItem[]>>({});
  const messageArea = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const loadedThread = useRef("");
  const selectedId = useRef("");
  const scrollRequest = useRef<{ older: boolean; height: number; top: number; bottom: boolean } | null>(null);
  const [loadedAt, setLoadedAt] = useState("");
  function choose(item: InboxItem) {
    selectedId.current = item.id;
    setSelected(item); setMobileDetail(true); setTarget(null); setThread(null); setReplies(EMPTY);
    ++replySeq.current; setLoadingReplies(false); setDetail(EMPTY); loadedThread.current = "";
    setNotice(""); setReplyError(""); setDeliveryError(""); setHandledComments(new Set());
    void loadDetail(item, undefined, true);
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { Object.values(mediaDraftsRef.current).forEach(item => URL.revokeObjectURL(item.preview)); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useLayoutEffect(() => {
    const area = messageArea.current, request = scrollRequest.current;
    if (kind !== "messages" || !area || !request) return;
    area.scrollTop = request.older ? request.top + area.scrollHeight - request.height
      : request.bottom ? area.scrollHeight : request.top;
    scrollRequest.current = null;
  }, [detail, kind, outbox.entries]);

  const outboxScope = `${pageId}:${platform}:${kind}`;
  const updateDelivery = outbox.updateStatuses;
  useEffect(() => {
    if (kind !== "messages" || !selected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = 8000;
      try {
        if (!document.hidden) {
          const result = await getSocialInboxDelivery({ pageId, platform, handle: selected.handle });
          if (cancelled) return;
          if (result.ok) {
            setDeliveryError("");
            updateDelivery(outboxScope, selected.id, result.data);
            const statuses = new Map(result.data.map(item => [item.id, item]));
            setDetail(prev => loadedThread.current !== selected.id ? prev : { ...prev, items: prev.items.map(item => {
              const update = statuses.get(item.id);
              return update ? { ...item, time: update.time, deliveryStatus: advanceDelivery(item.deliveryStatus, update.deliveryStatus) } : item;
            }) });
          } else { setDeliveryError("تعذر تحديث حالة التسليم والقراءة حالياً."); delay = 30000; }
        }
      } catch { if (!cancelled) setDeliveryError("تعذر تحديث حالة التسليم والقراءة حالياً."); delay = 30000; }
      if (!cancelled) timer = setTimeout(() => void poll(), delay);
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pageId, platform, kind, selected, outboxScope, updateDelivery]);

  const loadList = useCallback(async (after?: string) => {
    const seq = ++listSeq.current;
    setLoadingList(true); setListError("");
    try {
      const result = await getSocialInboxList({ pageId, platform, kind, after });
      if (!alive.current || seq !== listSeq.current) return;
      if (result.ok) { setList(prev => ({ ...result.data, items: (after ? merge(prev.items, result.data.items) : result.data.items)
        .map(item => kind === "messages" ? reconcileConversation(item, receipts.current[item.id]) : item) })); setLoadedAt(new Date().toISOString()); }
      else setListError(result.message);
    } catch { if (alive.current && seq === listSeq.current) setListError("تعذر الاتصال؛ أعد التحديث"); }
    finally { if (alive.current && seq === listSeq.current) setLoadingList(false); }
  }, [pageId, platform, kind]);
  useEffect(() => { void loadList(); }, [loadList]);

  const acknowledgeRead = useCallback((item: InboxItem, messageId: string) => {
    if (metaReadReceipts.current[item.id] === messageId) return Promise.resolve();
    const key = `${item.id}:${messageId}`;
    const pending = readRequests.current.get(key);
    if (pending) return pending;
    const sequence = (readSequences.current[item.id] || 0) + 1;
    readSequences.current[item.id] = sequence;
    const localReadBefore = receipts.current[item.id]?.readMessageId;
    const request = (async () => {
      let warning = "";
      try {
        const result = await markSocialInboxRead({ pageId, platform, handle: item.handle, messageId });
        if (!alive.current || readSequences.current[item.id] !== sequence) return;
        if (result.ok && result.data.marked) {
          // Do not replace a newer send/read receipt with a slow older acknowledgement.
          if (receipts.current[item.id]?.readMessageId === localReadBefore) {
            receipts.current[item.id] = { ...receipts.current[item.id], readMessageId: messageId };
            setList(prev => ({ ...prev, items: prev.items.map(conversation =>
              reconcileConversation(conversation, receipts.current[conversation.id])) }));
          }
          if (platform !== "facebook" || result.data.metaSynced || result.data.metaSyncRequired === false) {
            metaReadReceipts.current[item.id] = messageId;
          } else {
            warning = "قُرئت الرسائل داخل النظام، لكن Meta لم تؤكد مزامنة القراءة. أعد المزامنة؛ لا حاجة لإعادة إرسال الرد.";
          }
        } else if (result.ok) {
          warning = "تغيّرت المحادثة لدى Meta أو لم يظهر الرد في سجلّها بعد. حدّث المحادثة لمزامنة القراءة دون إخفاء رسالة جديدة.";
        } else {
          warning = `تعذرت مزامنة القراءة: ${result.message} لا تُعد إرسال الرد بسبب هذا التنبيه.`;
        }
      } catch {
        warning = "تعذرت مزامنة القراءة مع Meta؛ أعد المزامنة. لا حاجة لإعادة إرسال الرد.";
      }
      if (alive.current && readSequences.current[item.id] === sequence)
        setReadErrors(prev => ({ ...prev, [item.id]: warning }));
    })().finally(() => { readRequests.current.delete(key); });
    readRequests.current.set(key, request);
    return request;
  }, [pageId, platform]);

  const loadDetail = useCallback(async (item: InboxItem, after?: string, markRead = false) => {
    const seq = ++detailSeq.current;
    const area = messageArea.current;
    const scroll = { older: !!after, height: area?.scrollHeight || 0, top: area?.scrollTop || 0,
      bottom: loadedThread.current !== item.id || !area || area.scrollHeight - area.scrollTop - area.clientHeight < 80 };
    setLoadingDetail(true); setDetailError("");
    try {
      const result = await getSocialInboxDetail({ pageId, platform, kind, handle: item.handle, after });
      if (!alive.current || seq !== detailSeq.current) return;
      if (result.ok) {
        const sameThread = loadedThread.current === item.id;
        loadedThread.current = item.id;
        scrollRequest.current = scroll;
        setDetail(prev => ({ ...result.data,
          items: after || sameThread ? merge(prev.items, result.data.items) : result.data.items,
          window: after ? prev.window : result.data.window }));
        const latestId = "latestMessageId" in result.data ? result.data.latestMessageId : undefined;
        if (markRead && !after && kind === "messages" && latestId)
          void acknowledgeRead(item, latestId);
      }
      else setDetailError(result.message);
    } catch { if (alive.current && seq === detailSeq.current) setDetailError("تعذر تحميل التفاصيل"); }
    finally { if (alive.current && seq === detailSeq.current) setLoadingDetail(false); }
  }, [pageId, platform, kind, acknowledgeRead]);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      if (!document.hidden && !busy && !loadingList && !loadingDetail && !loadingReplies) {
        void loadList();
        if (selected) void loadDetail(selected, undefined, !!messageArea.current &&
          messageArea.current.scrollHeight - messageArea.current.scrollTop - messageArea.current.clientHeight < 80);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [auto, busy, loadingList, loadingDetail, loadingReplies, selected, loadList, loadDetail]);

  async function loadReplies(item: InboxItem, after?: string) {
    const seq = ++replySeq.current;
    setLoadingReplies(true); setReplyError("");
    try {
      const result = await getSocialInboxDetail({ pageId, platform, kind: "replies", handle: item.handle, after });
      if (!alive.current || seq !== replySeq.current) return;
      if (result.ok) setReplies(prev => ({ ...result.data, items: merge(
        after ? merge(prev.items, result.data.items) : result.data.items,
        confirmedComments.current[item.id] || []) }));
      else setReplyError(result.message);
    } catch { if (alive.current && seq === replySeq.current) setReplyError("تعذر تحميل الردود"); }
    finally { if (alive.current && seq === replySeq.current) setLoadingReplies(false); }
  }

  const destination = kind === "messages" ? selected : target;
  const draftKey = `${pageId}:${platform}:${kind}:${destination?.id || ""}`;
  const bookingKey = `${pageId}:${platform}:${selected?.id || ""}`;
  const draft = drafts[draftKey] || "";
  const pendingMedia = kind === "messages" && destination ? mediaDrafts[destination.id] : undefined;
  const privateReply = kind === "messages" && detail.window?.mode === "private-reply";
  const privateReplyLabel = !privateReply ? "الرد متاح"
    : detail.window?.reason === "private-reply-expired" ? "انتهت مهلة التعليق"
      : detail.window?.reason === "comment-unavailable" ? "الرد غير متاح" : "رد خاص على التعليق";
  const privateReplyConsumed = privateReply && (outbox.entries[outboxScope] || []).some(entry => entry.conversationId === selected?.id &&
    !!detail.window?.originMessageId && entry.previousMessageIds.includes(detail.window.originMessageId) && entry.item.deliveryStatus !== "failed");
  const canReply = kind === "comments" || (!privateReplyConsumed && !!detail.window?.canReply && !!detail.window.expiresAt && Date.parse(detail.window.expiresAt) > now);
  const canSendMedia = canReply && !privateReply;
  function updateMedia(id: string, item?: MediaDraft) {
    const previous = mediaDraftsRef.current[id];
    if (previous && previous.preview !== item?.preview) URL.revokeObjectURL(previous.preview);
    const next = { ...mediaDraftsRef.current };
    if (item) next[id] = item; else delete next[id];
    mediaDraftsRef.current = next; setMediaDrafts(next);
  }
  function selectMedia(file?: File) {
    if (!file || !destination || kind !== "messages" || busy || !canSendMedia) return;
    try {
      inboxMediaKind(file);
      updateMedia(destination.id, { file, preview: URL.createObjectURL(file) });
      setReplyError(""); setNotice("");
    } catch (err) { setReplyError(err instanceof Error ? err.message : "تعذر اختيار الملف"); }
  }
  function revealDraft() {
    setToolsOpen(false);
    setNotice("أُضيف الرد إلى المسودة؛ راجعه ثم اضغط إرسال.");
    requestAnimationFrame(() => composer.current?.focus());
  }
  function insertGeneralReply(text: string) {
    if (!destination || busy || !canReply || loadingDetail) return;
    const result = expandQuickReply(text, destination.title);
    if (result.missing.length) { setReplyError(`عدّل هذا الرد من إدارة الردود؛ متغيرات غير معروفة: ${result.missing.join("، ")}`); return; }
    const expanded = result.text;
    const next = !draft.trim() || /^\/\S*$/.test(draft.trim()) ? expanded : `${draft.trimEnd()}\n${expanded}`;
    if (next.length > 1000) { setReplyError("النص يتجاوز 1000 حرف؛ اختصر المسودة قبل إضافة الرد."); return; }
    setReplyError(""); onDraft(draftKey, next); revealDraft();
  }
  async function send(openNext = false) {
    if (!destination || sendingNow.current || busy || loadingDetail || (!draft.trim() && !pendingMedia) || !canReply) return;
    if (kind === "messages") {
      if (privateReply && pendingMedia) { setReplyError("الرد الأول على التعليق نصي فقط؛ أزل المرفق ثم أرسل ردك."); return; }
      // Capture this destination and draft; the operator may keep typing or switch conversations.
      sendingNow.current = true;
      queueMicrotask(() => { sendingNow.current = false; });
      const to = destination;
      const text = draft.trim();
      const attachment = pendingMedia;
      const preview = attachment ? URL.createObjectURL(attachment.file) : undefined;
      const optimistic: InboxItem = { id: `local:${crypto.randomUUID()}`, handle: "", title: "الصفحة",
        time: new Date().toISOString(), outgoing: true, text: attachment ? "" : text,
        attachments: attachment && preview ? [{ name: attachment.file.name, url: preview, kind: inboxMediaKind(attachment.file) }] : undefined };
      const previousIds = detail.items.map(item => item.id);
      setReplyError(""); setNotice("");
      if (attachment) updateMedia(to.id); else onDraft(draftKey, "");
      const area = messageArea.current;
      scrollRequest.current = { older: false, height: area?.scrollHeight || 0, top: area?.scrollTop || 0, bottom: true };
      void outbox.enqueue(outboxScope, to.id, optimistic, previousIds, async () => {
        let media = attachment?.uploaded;
        if (attachment && !media) {
          try {
            const uploaded = await startUpload([attachment.file], { pageId, platform, handle: to.handle });
            media = uploaded?.[0]?.serverData;
          } catch { throw new InboxSendFailure("تعذر رفع المرفق؛ لم يُرسل إلى الزبون."); }
          if (!media) throw new InboxSendFailure("لم يكتمل رفع المرفق؛ لم يُرسل إلى الزبون.");
        }
        const result = media ? await sendSocialInboxMedia({ pageId, platform, handle: to.handle, ticket: media.ticket })
          : await replyToSocialInbox({ pageId, platform, kind: "messages", handle: to.handle, text });
        if (!result.ok) throw new InboxSendFailure(result.message, result.uncertain);
        const reply: InboxItem = { ...optimistic, id: result.data.id, time: new Date().toISOString(), deliveryStatus: "sent",
          attachments: media ? [{ name: media.name, url: media.url, kind: media.kind }] : undefined };
        const previousMessageIds = "previousMessageIds" in result.data ? result.data.previousMessageIds : previousIds;
        // Separate from sending: a read-sync failure must never retry the customer's reply
        // or block the composer. Finish it even if the operator switched Page/workspace.
        void acknowledgeRead(to, reply.id);
        if (alive.current) {
          receipts.current[to.id] = { readMessageId: reply.id, reply, previousMessageIds };
          if (selectedId.current === to.id) {
            if ("replyMode" in result.data && result.data.replyMode === "private-reply") {
              const originMessageId = result.data.originMessageId;
              setDetail(prev => ({ ...prev, window: prev.window && prev.window.originMessageId === originMessageId
                ? { ...prev.window, canReply: false, reason: "private-reply-sent" } : prev.window }));
            }
            if ("stateSaved" in result.data && !result.data.stateSaved)
              setNotice("أُرسلت الرسالة، لكن تعذر حفظ حالة المتابعة. لا تُعد إرسالها.");
            if (openNext) {
              const next = nextAwaiting(matching, to.id, new Set(), Date.now() - 86400000);
              if (next) choose(next);
            }
          }
        }
        return { item: reply, previousMessageIds };
      });
      requestAnimationFrame(() => composer.current?.focus());
      return;
    }
    sendingNow.current = true;
    // Ignore older refresh responses; they must not overwrite the confirmed send.
    ++listSeq.current; setLoadingList(false);
    setBusy(true); onSending(true); setReplyError(""); setNotice("");
    try {
      const result = await replyToSocialInbox({ pageId, platform, kind: "comments", handle: destination.handle, text: draft });
      if (!alive.current) return;
      if (!result.ok) { setReplyError(result.message); return; }
      onDraft(draftKey, ""); setNotice("نُشر الرد على التعليق");
      const reply: InboxItem = { id: result.data.id, handle: "", title: "الصفحة", text: draft.trim(), time: new Date().toISOString(), outgoing: true };
      confirmedComments.current[destination.id] = merge(confirmedComments.current[destination.id] || [], [reply]);
      if (thread?.id === destination.id) setReplies(prev => ({ ...prev, items: merge(prev.items, [reply]) }));
      setHandledComments(prev => new Set([...prev, destination.id]));
      if (openNext) {
        const next = nextAwaiting(detail.items, destination.id, handledComments);
        if (next) { setTarget(next); setThread(next); setReplies(EMPTY); void loadReplies(next); }
        else { setTarget(null); setNotice("نُشر الرد. لا تعليقات أخرى من الزبائن ضمن المحمّل لم تتم متابعتها في هذه الجلسة."); }
      }
    } catch { if (alive.current) setReplyError("لم نستلم تأكيد النشر؛ تحقّق في Meta قبل إعادة المحاولة"); }
    finally { sendingNow.current = false; if (alive.current) { setBusy(false); setUploadProgress(null); } onSending(false); }
  }

  const scopeEntries = outbox.entries[outboxScope] || [];
  const effectiveList = list.items.map(item => scopeEntries.filter(entry => entry.conversationId === item.id && ["sent", "delivered", "read"].includes(entry.item.deliveryStatus || ""))
    .reduce((current, entry) => reconcileConversation(current, { reply: entry.item, readMessageId: entry.item.id, previousMessageIds: entry.previousMessageIds }), item));
  const matching = effectiveList.filter(item => `${item.title} ${item.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const unread = (item: InboxItem) => (item.unread || 0) > 0;
  const awaiting = (item: InboxItem) => item.outgoing === false && !item.system;
  const filters = [
    { value: "all", label: "الكل", matches: () => true },
    { value: "attention", label: "تحتاج متابعة", matches: (item: InboxItem) => unread(item) || awaiting(item) },
    ...(platform === "facebook" ? [{ value: "unread", label: "غير المقروءة", matches: unread }] : []),
    { value: "awaiting", label: "لم يتم الرد عليها", matches: awaiting },
    { value: "answered", label: "تم الرد عليها", matches: (item: InboxItem) => item.outgoing === true },
  ];
  const visible = matching.filter(filters.find(option => option.value === filter)?.matches || filters[0].matches);
  const detailItems = kind === "messages" ? mergeOutbox(detail.items, scopeEntries.filter(entry => entry.conversationId === selected?.id)).filter(item => !item.commentCopy).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)) : detail.items;
  const commentGroups = kind === "comments" ? groupInboxComments(detail.items) : [];
  const replyWindowText = privateReply
    ? privateReplyConsumed || detail.window?.reason === "private-reply-sent" ? "الرد الخاص على التعليق لا يفتح نافذة المحادثة؛ انتظر رسالة خاصة جديدة من الزبون قبل إرسال المزيد."
      : detail.window?.reason === "private-reply-expired" ? "انتهت مهلة الرد الخاص على هذا التعليق (7 أيام)."
        : canReply ? `متاح رد خاص نصي واحد على التعليق حتى ${date(detail.window!.expiresAt!)}. تبدأ نافذة الرد العادي عندما يرسل الزبون رسالة خاصة.`
          : "تعذر تأكيد إتاحة الرد الخاص على التعليق؛ حدّث المحادثة أو تابعها من Meta."
    : detail.window?.reason === "comment-origin"
    ? "هذه المحادثة بدأت من تعليق؛ إشعار فيسبوك لا يفتح نافذة الرد العادي. استخدم عرض التعليق لمتابعته."
    : detail.window?.expiresAt ? canReply ? `الرد متاح حتى ${date(detail.window.expiresAt)}`
      : "انتهت نافذة الرد العادي (24 ساعة من آخر رسالة واردة)" : "افتح الرسائل للتحقق من نافذة الرد";
  return <div className="flex flex-col gap-2 flex-1 min-h-0">
    {listError && <ErrorMessage text={listError} />}
    <div className={`relative grid lg:grid-cols-[300px_minmax(0,1fr)] ${toolsOpen ? "xl:grid-cols-[300px_minmax(0,1fr)_280px]" : ""} gap-2 flex-1 min-h-0`}>
      <aside className={`rounded-xl border bg-card overflow-hidden flex-col min-h-0 ${mobileDetail ? "hidden lg:flex" : "flex"}`}>
        <div className="p-3 border-b space-y-3 shrink-0">
          <div className="flex items-center gap-1"><h2 className="text-sm font-semibold me-auto">{kind === "messages" ? "المحادثات" : "المنشورات"} <span className="text-xs text-muted-foreground font-normal">{list.items.length}</span></h2>
            <Button size="icon" className="size-8" variant="ghost" aria-label="تحديث الصندوق" title="تحديث الصندوق" disabled={loadingList || busy} onClick={() => { void loadList(); if (selected) void loadDetail(selected, undefined, true); }}><RefreshCw className={loadingList ? "animate-spin" : ""} /></Button>
            <Popover><PopoverTrigger asChild><Button size="icon" className="size-8" variant="ghost" aria-label="خيارات العرض والتحديث" title="خيارات العرض والتحديث"><MoreHorizontal /></Button></PopoverTrigger>
              <PopoverContent dir="rtl" align="start" className="space-y-3 text-xs max-w-[calc(100vw-2rem)]">
                <p className="font-semibold text-sm">خيارات الصندوق</p>
                <label className="flex items-center gap-2"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />تحديث تلقائي كل 30 ثانية</label>
                <p className="text-muted-foreground">{loadedAt ? `آخر تحديث: ${date(loadedAt)}` : "لم يتم تحميل القائمة بعد"}</p>
                <p className="text-muted-foreground">الفلاتر والأعداد تخص النتائج المحمّلة. «تحتاج متابعة» تجمع غير المقروءة والتي آخر رسالة فيها من الزبون. حمّل المزيد لعرض الأقدم.</p>
                <p className="text-muted-foreground border-t pt-2">البيانات من Meta؛ قد لا يظهر بعض المحتوى القديم أو منشورات الإعلانات غير المنشورة.</p>
              </PopoverContent>
            </Popover>
          </div>
          <div className="relative"><Search className="absolute start-2.5 top-2.5 size-4 text-muted-foreground" /><input aria-label="البحث في النتائج المحملة" placeholder={kind === "messages" ? "ابحث عن محادثة…" : "ابحث عن منشور…"} value={query} onChange={e => setQuery(e.target.value)} className="rounded-lg border bg-muted/30 py-2 ps-9 pe-2 w-full text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></div>
          {kind === "messages" && <div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-muted-foreground shrink-0" /><select aria-label="فلتر المحادثات" value={filter} onChange={e => setFilter(e.target.value)} className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs">
            {filters.map(option => <option key={option.value} value={option.value}>{option.label} ({matching.filter(option.matches).length})</option>)}
          </select></div>}
        </div>
        <div className="flex-1 min-h-0 overflow-auto divide-y">
          {loadingList && !list.items.length ? <Loading /> : !visible.length ? <p className="p-6 text-sm text-muted-foreground">{query || filter !== "all" ? "لا نتائج مطابقة ضمن المحمّل" : listError ? "تعذر جلب القائمة" : "لا توجد نتائج متاحة"}</p> : visible.map(item => <button key={item.id} disabled={busy} aria-pressed={selected?.id === item.id}
            onClick={() => choose(item)}
            className={`w-full text-start px-3 py-3 border-s-2 hover:bg-muted/60 transition-colors ${selected?.id === item.id ? "bg-muted/70 border-primary" : "border-transparent"}`}>
            <span className="font-semibold text-sm flex justify-between gap-2"><span className="truncate">{item.title}</span>{!!item.unread && <span className="rounded-full bg-primary text-primary-foreground px-2 h-5 text-xs">{item.unread}</span>}</span>
            <span className="block text-xs text-muted-foreground truncate mt-1">{kind === "messages" && item.outgoing ? "أنت: " : ""}{item.text}</span>
            <span className="flex items-center justify-between gap-1 mt-1"><span className={`text-[10px] ${item.outgoing ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{kind === "messages" ? item.system ? "بدأت من تعليق" : item.outgoing === true ? "تم الرد" : item.outgoing === false ? "بانتظار الرد" : "" : "منشور"}</span>
            <time className="text-[10px] text-muted-foreground">{date(item.time)}</time></span>
          </button>)}
        </div>
        {list.after && <div className="p-2 border-t"><Button size="sm" variant="ghost" className="w-full" disabled={loadingList || busy} onClick={() => void loadList(list.after!)}>تحميل المزيد</Button></div>}
      </aside>
      <section className={`rounded-xl border bg-card min-w-0 min-h-0 overflow-hidden flex-col ${mobileDetail ? "flex" : "hidden lg:flex"}`} aria-busy={loadingDetail}>
        <div className="px-3 py-2 border-b flex items-center gap-2 shrink-0 min-h-14">
          {selected && <Button className="lg:hidden" variant="ghost" size="sm" onClick={() => setMobileDetail(false)} aria-label="العودة إلى القائمة"><ArrowRight className="size-4" /></Button>}
          <div className="min-w-0 flex-1"><h2 className="font-semibold text-sm truncate">{selected?.title || "مساحة المحادثة"}</h2>
            {selected && <p className="text-[11px] text-muted-foreground">{platform === "facebook" ? "فيسبوك" : "إنستغرام"} · {kind === "messages" ? "محادثة خاصة" : "تعليقات عامة"}</p>}</div>
          {selected && kind === "messages" && (canReply || privateReply) && <Popover><PopoverTrigger asChild><button type="button" aria-label="تفاصيل نافذة الرد" className={`rounded-full px-2 py-1 text-[11px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${canReply ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"}`}>{privateReply && (privateReplyConsumed || detail.window?.reason === "private-reply-sent") ? "بانتظار رد الزبون" : privateReplyLabel}</button></PopoverTrigger><PopoverContent dir="rtl" className="text-xs max-w-[calc(100vw-2rem)]">{replyWindowText}</PopoverContent></Popover>}
          {selected?.url && <a className="text-xs shrink-0" href={selected.url} target="_blank" rel="noopener noreferrer" aria-label="فتح المنشور"><ExternalLink className="size-4" /></a>}
          {selected && kind === "messages" && <SocialInboxOrderLookup key={`lookup:${selected.id}`} messages={detail.items} selectedPhone={bookingFields[bookingKey]?.phoneNumber} disabled={busy || loadingDetail} />}
          {selected && kind === "messages" && <SocialInboxOrder key={selected.id} scope={{ pageId, platform, handle: selected.handle }} suggestedProduct={orderProducts[selected.id]} disabled={busy || loadingDetail} onWorking={value => { setBusy(value); onSending(value); }} selectedFields={bookingFields[bookingKey]} onSelectedFieldChange={(field, value) => onBookingField(bookingKey, field, value)} />}
          <Button size="sm" variant={toolsOpen ? "secondary" : "ghost"} aria-pressed={toolsOpen} onClick={() => setToolsOpen(value => !value)}><PanelLeft className="size-4" /><span className="hidden sm:inline">أدوات الرد</span><span className="sr-only sm:hidden">أدوات الرد</span></Button>
        </div>
        {!selected ? <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 text-center"><MessageCircle className="size-10 opacity-30" /><p className="text-sm">اختر {kind === "messages" ? "محادثة لقراءة الرسائل والرد" : "منشوراً لعرض تعليقاته والرد عليها"}</p></div> : <>
          {detailError && <ErrorMessage text={detailError} />}
          {selected && readErrors[selected.id] && <div role="status" className="flex items-center gap-2 p-3 text-xs text-amber-700 dark:text-amber-400">
            <p className="flex-1">{readErrors[selected.id]}</p>
            <Button size="sm" variant="outline" disabled={loadingDetail} onClick={() => void loadDetail(selected, undefined, true)}>إعادة مزامنة القراءة</Button>
          </div>}
          {deliveryError && <p role="status" className="px-3 py-1 text-[11px] text-muted-foreground">{deliveryError}</p>}
          <div ref={messageArea} className="flex-1 min-h-0 overflow-auto overscroll-contain bg-muted/15 p-3 sm:p-4 space-y-3" role="region" aria-label={kind === "messages" ? "الرسائل" : "التعليقات"}>
            {detail.after && <div className="text-center"><Button size="sm" variant="ghost" disabled={loadingDetail || busy} onClick={() => void loadDetail(selected, detail.after!)}>تحميل {kind === "messages" ? "رسائل أقدم" : "تعليقات إضافية"}</Button></div>}
            {kind === "comments" && <details className="rounded-lg border bg-background p-2"><summary className="cursor-pointer text-xs font-semibold">المنشور الأصلي</summary><p dir="auto" className="text-sm whitespace-pre-wrap break-words mt-2 max-h-36 overflow-auto">{selected.text || "منشور بدون نص"}</p></details>}
            {loadingDetail && !detailItems.length ? <Loading /> : !detailItems.length ? <p className="text-sm text-muted-foreground">{detailError ? "تعذر تحميل المحتوى" : "لا يوجد محتوى متاح"}</p> : kind === "comments" ? <>
              <p className="text-[11px] text-muted-foreground">تُجمع تعليقات الزبون على هذا المنشور بحسب هويته. التجميع يشمل التعليقات المحمّلة{detail.after ? "؛ حمّل المزيد لإضافة الأقدم." : "."}</p>
              {commentGroups.map(group => <SocialInboxCommentGroup key={group.key} group={group} targetId={target?.id} handled={handledComments} disabled={busy}
                onReply={item => { setTarget(item); setThread(item); setReplies(EMPTY); void loadReplies(item); }}
                onThread={item => { setThread(item); setReplies(EMPTY); void loadReplies(item); }} />)}
            </> : detailItems.map(item => <div key={item.id} className={`rounded-2xl border px-3 py-2 [overflow-wrap:anywhere] ${item.system ? "bg-muted/30 border-dashed mx-auto max-w-xl" : item.outgoing ? "w-fit max-w-[90%] sm:max-w-[80%] ms-auto rounded-es-sm bg-emerald-50/80 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/60" : "w-fit max-w-[90%] sm:max-w-[80%] me-auto rounded-ee-sm bg-background"}`}>
              <ItemBody item={item} compact={kind === "messages"} hideCommentLink={!!item.system && kind === "messages" && platform === "facebook"} />
              {item.deliveryStatus === "failed" && !!item.text && <Button size="sm" variant="ghost" className="h-6 mt-1 text-xs" onClick={() => { onDraft(draftKey, draft.trim() ? `${draft.trimEnd()}\n${item.text}`.slice(0, 1000) : item.text); requestAnimationFrame(() => composer.current?.focus()); }}>إعادة النص إلى المسودة</Button>}
              {item.system && kind === "messages" && platform === "facebook" && <SocialInboxOrigin key={`${selected.id}:${selected.handle}:${item.id}`} pageId={pageId} platform={platform} handle={selected.handle} messageId={item.id} disabled={busy} onProduct={product => setOrderProducts(prev => ({ ...prev, [selected.id]: product }))} />}
            </div>)}
          {thread && kind === "comments" && <div className="border-t p-3 mt-3 space-y-2 bg-muted/20">
            <div className="flex justify-between gap-2"><h3 className="font-medium text-sm">ردود على تعليق {thread.title}</h3><Button disabled={busy} size="sm" variant="ghost" onClick={() => { ++replySeq.current; setLoadingReplies(false); setThread(null); }}>إغلاق</Button></div>
            {loadingReplies && !replies.items.length ? <Loading /> : replies.items.length ? replies.items.map(item => <div key={item.id} className="rounded-lg border bg-background p-3"><ItemBody item={item} /></div>) : <p className="text-sm text-muted-foreground">لا ردود محمّلة</p>}
            {replies.after && <Button disabled={loadingReplies || busy} variant="outline" size="sm" onClick={() => void loadReplies(thread, replies.after!)}>تحميل ردود إضافية</Button>}
          </div>}
          </div>
          <div className="border-t p-3 space-y-2 shrink-0 max-h-[45%] overflow-auto bg-card">
            {kind === "messages" && <SocialInboxSelection key={selected.id} container={messageArea} disabled={busy || loadingDetail} onApply={(field, value) => {
              onBookingField(bookingKey, field, value);
              setNotice(`أُضيف ${field === "phoneNumber" ? "رقم الهاتف" : "العنوان"} إلى مسودة الحجز. افتح «تجهيز طلب» للمراجعة.`);
            }} />}
            {kind === "messages" ? (!canReply || privateReply) && <p className={`text-xs ${canReply ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>{replyWindowText}</p> : target ? <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate">ردّ عام على {target.title}: {target.text}</span><Button disabled={busy} size="sm" variant="ghost" aria-label="إلغاء الرد على التعليق" onClick={() => setTarget(null)}><X className="size-3" /></Button></div> : <p className="text-xs text-muted-foreground">اختر «ردّ على التعليق» لتحديد التعليق المستهدف.</p>}
            {destination && <>{pendingMedia && <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2" aria-label="معاينة المرفق">
              {pendingMedia.file.type.startsWith("image/") ? <Image unoptimized src={pendingMedia.preview} alt="معاينة الصورة المختارة" width={64} height={48} className="h-12 w-16 rounded object-contain" />
                : <video src={pendingMedia.preview} controls preload="metadata" className="h-16 w-24 rounded object-contain" aria-label="معاينة الفيديو المختار" />}
              <div className="min-w-0 flex-1 text-xs"><p className="truncate font-medium">{pendingMedia.file.name}</p><p className="text-muted-foreground">{(pendingMedia.file.size / 1024 / 1024).toFixed(1)} MB · يُرسل المرفق مستقلاً؛ النص يبقى مسودة.</p>
                {uploadProgress !== null && <div role="status" className="mt-1"><progress aria-label="تقدم رفع المرفق" max={100} value={uploadProgress} className="h-1.5 w-full" />جارٍ الرفع {uploadProgress}%</div>}</div>
              <Button size="icon" variant="ghost" className="size-7 shrink-0" disabled={busy} aria-label="إزالة المرفق" onClick={() => updateMedia(destination.id)}><X /></Button>
            </div>}{!!generalReplies.length && <div className="flex flex-wrap items-center gap-1 max-h-24 overflow-y-auto" role="group" aria-label="ردود عامة دون اختيار منتج">
              {generalReplies.map(reply => <Button key={reply.id} type="button" size="sm" variant="secondary" className="h-7 shrink-0 max-w-40" title={`${reply.title} · /${reply.shortcut}`} disabled={busy || !canReply || loadingDetail} onClick={() => insertGeneralReply(reply.text)}><span className="truncate">{reply.title}</span></Button>)}
            </div>}<Textarea ref={composer} aria-label="نص الرد" placeholder={kind === "messages" ? "اكتب ردّك…" : "اكتب رداً عاماً على التعليق…"} value={draft} maxLength={1000} disabled={busy || !canReply || loadingDetail} onChange={e => { onDraft(draftKey, e.target.value); if (notice) setNotice(""); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} rows={2} className="min-h-14 max-h-28 resize-none bg-muted/20 shadow-none focus-visible:ring-1" />
              {draft.trim().startsWith("/") && <Button size="sm" variant="outline" onClick={() => setToolsOpen(true)}>اختيار الرد الجاهز المطابق للاختصار</Button>}
              <div className="flex justify-between items-center gap-2 text-[11px] text-muted-foreground"><div className="flex items-center gap-2">{kind === "messages" && <>
                <input ref={filePicker} type="file" accept={INBOX_MEDIA_ACCEPT} className="sr-only" aria-label="اختيار صورة أو فيديو" disabled={busy || !canSendMedia || loadingDetail} onChange={e => { selectMedia(e.target.files?.[0]); e.target.value = ""; }} />
                <Button size="icon" variant="ghost" className="size-8" title={privateReply ? "الرد الأول على التعليق نصي فقط" : "إرفاق صورة (حتى 8MB) أو فيديو MP4 (حتى 25MB)"} aria-label="إرفاق صورة أو فيديو" disabled={busy || !canSendMedia || loadingDetail} onClick={() => filePicker.current?.click()}><Paperclip /></Button>
              </>}<span>{draft.length}/1000 · {kind === "comments" ? "رد علني" : "رسالة خاصة"}<span className="hidden md:inline"> · Ctrl + Enter للإرسال</span></span></div>
                <div className="flex gap-px rounded-lg overflow-hidden shrink-0"><Button size="sm" className="rounded-none shadow-none" disabled={busy || (!draft.trim() && !pendingMedia) || !canReply || loadingDetail} onClick={() => void send()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{pendingMedia ? "إرسال المرفق" : "إرسال"}</Button>
                  <DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button size="sm" className="rounded-none px-2 shadow-none" aria-label="خيارات الإرسال" disabled={busy || (!draft.trim() && !pendingMedia) || !canReply || loadingDetail}><ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void send(true)}><SkipForward className="size-4" />إرسال وفتح التالي</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                </div>
              </div></>}
            {replyError && <ErrorMessage text={replyError} />}{notice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
          </div>
        </>}
      </section>
      <div className={toolsOpen ? "absolute inset-0 z-10 bg-background p-1 flex flex-col min-h-0 xl:static xl:bg-transparent xl:p-0" : "hidden"}><Button size="sm" variant="ghost" className="self-end xl:hidden" onClick={() => setToolsOpen(false)}><X className="size-4 me-1" />العودة للمحادثة</Button><div className="flex-1 min-h-0 overflow-auto"><SocialInboxTools key={selected?.id || "empty"} library={quickReplies} name={destination?.title || ""} draft={draft} disabled={!destination || busy || !canReply || loadingDetail} onDraft={text => onDraft(draftKey, text)} onInserted={revealDraft} onProductSelected={product => { if (selected) setOrderProducts(prev => ({ ...prev, [selected.id]: product || undefined })); }} /></div></div>
    </div>
  </div>;
}

function Loading() { return <p role="status" className="p-5 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />جارٍ التحميل…</p>; }
function ErrorMessage({ text }: { text: string }) { return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{text}</p>; }
