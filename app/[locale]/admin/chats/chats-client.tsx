"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  getWaInbox,
  getWaThread,
  sendWaReply,
  sendWaImageReply,
} from "@/lib/actions/whatsapp.actions";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Image as ImageIcon,
  Inbox,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Search,
  Send,
  TriangleAlert,
  Undo2,
  User,
  X,
} from "lucide-react";
import { inboxOrderLookupHref } from "@/lib/meta/inbox-workflow";
import type { WaConversationFilter } from "@/lib/whatsapp-inbox-filters";

type Conversation = {
  id: string;
  phone: string;
  customerName: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  windowExpiresAt: string | null;
};

type Message = {
  id: string;
  direction: string;
  type: string;
  body: string | null;
  mediaId: string | null;
  status: string;
  errorCode: string | null;
  timestamp: string;
};

type CustomerOrder = {
  id: string;
  status: string;
  totalPrice: number;
  createdAt: string;
  items: string;
  phoneNumber?: string;
  isArchived?: boolean;
};

type Thread = {
  conversation: {
    id: string;
    phone: string;
    customerName: string | null;
    windowExpiresAt: string | null;
  };
  messages: Message[];
  orders: CustomerOrder[];
};

const LIST_POLL_MS = 6000;
const THREAD_POLL_MS = 4000;
type InboxData = Awaited<ReturnType<typeof getWaInbox>>;

/** محادثات أُرسل لها قالب معيّن — يُفلتر على الخادم */
type TemplateFilter = "all" | "confirmation" | "returned";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-IQ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "اليوم";
  if (d.toDateString() === yesterday.toDateString()) return "أمس";
  return d.toLocaleDateString("ar-IQ", { day: "numeric", month: "short" });
}

function initials(name: string | null, phone: string) {
  const value = name?.trim();
  if (!value) return phone.slice(-2);
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function previewText(value: string | null) {
  if (!value) return "لا توجد معاينة للرسالة";
  return value.length > 58 ? `${value.slice(0, 58)}…` : value;
}

function StatusTicks({ status }: { status: string }) {
  if (status === "failed")
    return <TriangleAlert className="w-3.5 h-3.5 text-red-300" />;
  if (status === "read")
    return <CheckCheck className="w-3.5 h-3.5 text-sky-300" />;
  if (status === "delivered")
    return <CheckCheck className="w-3.5 h-3.5 opacity-70" />;
  if (status === "sending") return <Clock className="w-3 h-3 opacity-70" />;
  return <Check className="w-3.5 h-3.5 opacity-70" />;
}

/** الموقع يُخزَّن كـ JSON من الويبهوك — نعرضه كرابط خرائط قابل للنقر. */
function LocationBubble({ raw }: { raw: string | null }) {
  if (!raw) return null;
  let loc: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
  } | null = null;
  try {
    loc = JSON.parse(raw);
  } catch {
    return <span className="italic opacity-70">📍 موقع</span>;
  }
  if (!loc?.latitude || !loc?.longitude) {
    return <span className="italic opacity-70">📍 موقع</span>;
  }
  const label = loc.name || loc.address || "موقع الزبون";
  return (
    <a
      href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 underline"
    >
      <MapPin className="w-4 h-4 shrink-0" />
      <span className="break-words">{label}</span>
    </a>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] sm:max-w-[70%] rounded-[10px] px-3 py-2 text-sm shadow-sm ${
          isOut
            ? "bg-emerald-600 text-white"
            : "border bg-background text-foreground"
        } ${msg.status === "failed" ? "ring-2 ring-red-400" : ""}`}
      >
        {msg.type === "image" && msg.mediaId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/whatsapp/media/${msg.mediaId}`}
            alt=""
            className="rounded-[10px] max-h-64 mb-1"
            loading="lazy"
          />
        )}
        {msg.type === "video" && msg.mediaId && (
          <video
            src={`/api/whatsapp/media/${msg.mediaId}`}
            controls
            className="rounded-[10px] max-h-64 mb-1"
          />
        )}
        {msg.type === "audio" && msg.mediaId && (
          <audio
            src={`/api/whatsapp/media/${msg.mediaId}`}
            controls
            className="max-w-full mb-1"
          />
        )}
        {msg.type === "document" && msg.mediaId && (
          <a
            href={`/api/whatsapp/media/${msg.mediaId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 underline mb-1"
          >
            <FileText className="w-4 h-4" /> ملف مرفق
          </a>
        )}
        {msg.type === "location" && <LocationBubble raw={msg.body} />}
        {msg.type === "contacts" && msg.body && (
          <span className="flex items-center gap-1.5">
            <User className="w-4 h-4 shrink-0" /> {msg.body}
          </span>
        )}
        {msg.type === "reaction" && (
          <span className="opacity-80">
            {msg.body ? `تفاعل بـ ${msg.body}` : "أزال التفاعل"}
          </span>
        )}
        {msg.type === "order" && msg.body && (
          <span className="flex items-center gap-1.5">
            <Package className="w-4 h-4 shrink-0" /> {msg.body}
          </span>
        )}
        {msg.type === "system" && (
          <span className="italic opacity-70">{msg.body}</span>
        )}
        {msg.type === "unsupported" && (
          <span className="italic opacity-70">
            رسالة غير مدعومة{msg.body ? ` (${msg.body})` : ""}
          </span>
        )}
        {/* أنواع لها عرض خاص أعلاه — لا نكرر النص الخام تحتها */}
        {msg.body &&
          ![
            "location",
            "contacts",
            "reaction",
            "order",
            "system",
            "unsupported",
          ].includes(msg.type) && (
            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          )}
        <div
          className={`flex items-center gap-1 mt-0.5 text-[10px] ${
            isOut ? "text-white/80 justify-end" : "text-muted-foreground"
          }`}
        >
          {formatTime(msg.timestamp)}
          {isOut && <StatusTicks status={msg.status} />}
        </div>
        {msg.status === "failed" && (
          <div className="text-[10px] text-red-200 mt-0.5">
            فشل الإرسال{msg.errorCode ? ` (${msg.errorCode})` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function windowRemaining(windowExpiresAt: string | null, now: number) {
  if (!windowExpiresAt) return null;
  const ms = new Date(windowExpiresAt).getTime() - now;
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return { hours, minutes };
}

const ChatsClient = ({
  initialInbox,
  configured,
}: {
  initialInbox: InboxData;
  configured: boolean;
}) => {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const { toast } = useToast();
  const [conversations, setConversations] =
    useState<Conversation[]>(initialInbox.conversations);
  const [query, setQuery] = useState(initialInbox.selection.query);
  const [filter, setFilter] = useState<WaConversationFilter>(initialInbox.selection.filter);
  const [templateFilter, setTemplateFilter] =
    useState<TemplateFilter>(initialInbox.selection.template);
  const [templateCounts, setTemplateCounts] = useState(initialInbox.templateCounts);
  const [counts, setCounts] = useState(initialInbox.counts);
  const [listLoading, setListLoading] = useState(false);
  const listRequestId = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const threadRequestId = useRef(0);
  const readThreadId = useRef<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // تحديث قائمة المحادثات دورياً
  const refreshList = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    // ردّ متأخر لبحث/فلتر سابق يجب ألا يكتب فوق نتيجة الفلتر الحالي
    const requestId = ++listRequestId.current;
    try {
      const data = await getWaInbox(
        query || undefined,
        templateFilter === "all" ? undefined : templateFilter,
        filter,
      );
      if (requestId !== listRequestId.current) return;
      setConversations(data.conversations);
      setTemplateCounts(data.templateCounts);
      setCounts(data.counts);
      setListLoading(false);
    } catch {
      /* تجاهل أخطاء الشبكة العابرة أثناء الاستعلام الدوري */
    }
  }, [query, templateFilter, filter]);

  const changeFilter = (value: WaConversationFilter) => {
    if (value === filter) return;
    ++listRequestId.current;
    setListLoading(true);
    setFilter(value);
  };

  const changeQuery = (value: string) => {
    ++listRequestId.current;
    setListLoading(true);
    setQuery(value);
  };

  const changeTemplateFilter = (value: TemplateFilter) => {
    if (value === templateFilter) return;
    ++listRequestId.current;
    setListLoading(true);
    setTemplateFilter(value);
  };

  useEffect(() => {
    // جلب أولي مؤجل (يعمل أيضاً كتأخير بسيط أثناء الكتابة في البحث)
    const kickoff = setTimeout(refreshList, 300);
    const interval = setInterval(refreshList, LIST_POLL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [refreshList]);

  // تحديث المحادثة المفتوحة دورياً
  const refreshThread = useCallback(async () => {
    if (!selectedId || document.visibilityState !== "visible") return;
    const requestId = ++threadRequestId.current;
    try {
      const data = await getWaThread(selectedId);
      if (data && requestId === threadRequestId.current && selectedIdRef.current === selectedId) {
        setThread(data);
        // Opening the thread marks it read on the server; refresh counters immediately.
        if (readThreadId.current !== selectedId) {
          readThreadId.current = selectedId;
          void refreshList();
        }
      }
    } catch {
      /* تجاهل */
    }
  }, [selectedId, refreshList]);

  useEffect(() => {
    if (!selectedId) return;
    const kickoff = setTimeout(refreshThread, 0);
    const interval = setInterval(refreshThread, THREAD_POLL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [selectedId, refreshThread]);

  const openConversation = (id: string) => {
    if (selectedIdRef.current === id) return;
    selectedIdRef.current = id;
    ++threadRequestId.current;
    readThreadId.current = null;
    setSelectedId(id);
    setThread(null);
    lastMessageCount.current = 0;
  };

  // ساعة حية لمؤشر نافذة الـ 24 ساعة
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // النزول لآخر رسالة عند وصول رسائل جديدة
  useEffect(() => {
    const count = thread?.messages.length ?? 0;
    if (count !== lastMessageCount.current) {
      lastMessageCount.current = count;
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [thread?.messages.length]);

  const remaining = useMemo(
    () => windowRemaining(thread?.conversation.windowExpiresAt ?? null, now),
    [thread?.conversation.windowExpiresAt, now],
  );
  const windowOpen = remaining !== null;

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // يسمح بإعادة اختيار نفس الملف بعد الإزالة
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        description: "حجم الصورة أكبر من 5 ميغابايت",
      });
      return;
    }
    setImageFile(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearImage = () => {
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(null);
  };

  const handleSendImage = async () => {
    if (!selectedId || !imageFile || sending) return;
    const caption = replyText.trim();
    const file = imageFile;
    setSending(true);

    const form = new FormData();
    form.append("conversationId", selectedId);
    form.append("caption", caption);
    form.append("file", file);

    const result = await sendWaImageReply(form);
    setSending(false);
    if (result.success) {
      setReplyText("");
      clearImage();
    } else {
      toast({ variant: "destructive", description: result.message });
    }
    await refreshThread();
    refreshList();
  };

  const handleSend = async () => {
    if (sending) return;
    if (imageFile) return handleSendImage();
    if (!selectedId || !replyText.trim()) return;
    const text = replyText.trim();
    setSending(true);
    setReplyText("");

    // إظهار الرسالة فوراً بحالة "جارٍ الإرسال"
    setThread((prev) =>
      prev
        ? {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: `optimistic-${Date.now()}`,
                direction: "out",
                type: "text",
                body: text,
                mediaId: null,
                status: "sending",
                errorCode: null,
                timestamp: new Date().toISOString(),
              },
            ],
          }
        : prev,
    );

    const result = await sendWaReply(selectedId, text);
    setSending(false);
    if (!result.success) {
      toast({ variant: "destructive", description: result.message });
      setReplyText(text);
    }
    await refreshThread();
    refreshList();
  };

  const selectedName =
    thread?.conversation.customerName || thread?.conversation.phone;
  const visibleConversations = conversations;

  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <MessageCircle className="w-10 h-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">{t("chats")}</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          واتساب غير مُهيأ لهذه النسخة — أضف المتغيرات WHATSAPP_TOKEN و
          WHATSAPP_PHONE_NUMBER_ID و WHATSAPP_VERIFY_TOKEN و WHATSAPP_APP_SECRET
          في إعدادات Vercel ثم أعد النشر.
        </p>
      </div>
    );
  }

  return (
    <div data-wa-inbox dir="rtl" className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col gap-3 [&_button]:rounded-[10px] [&_input]:rounded-[10px]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[10px] border bg-card px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-[10px] bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300"><MessageCircle className="h-5 w-5" /></div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight">
              {t("chats")}
            </h1>
            <span className="rounded-[10px] bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {counts.all} محادثة
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold tabular-nums">{counts.unread}</span>
            <span className="text-muted-foreground">محادثات غير مقروءة</span>
          </div>
          <div className="flex items-center gap-2 border-s ps-4">
            <span className="font-bold tabular-nums text-emerald-600">
              {counts.open}
            </span>
            <span className="text-muted-foreground">متاحة للرد</span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[10px] border bg-card">
        {/* ── قائمة المحادثات ── */}
        <aside
          aria-label="قائمة محادثات واتساب"
          className={`w-full md:w-[310px] lg:w-[340px] shrink-0 min-h-0 md:border-e flex flex-col ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="space-y-2 border-b bg-muted/20 p-3">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                aria-label="البحث في محادثات واتساب"
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                placeholder="بحث بالاسم أو الرقم..."
                className="ps-8 h-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => changeQuery("")}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-[10px] p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="مسح البحث"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="فلتر حالة المحادثة">
              {(
                [
                  ["all", "الكل", counts.all],
                  [
                    "unread",
                    "غير المقروءة",
                    counts.unread,
                  ],
                  ["open", "الرد متاح", counts.open],
                  [
                    "closed",
                    "النافذة منتهية",
                    counts.closed,
                  ],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeFilter(value)}
                  aria-pressed={filter === value}
                  className={`shrink-0 rounded-[10px] border px-2 py-1.5 text-[11px] font-medium transition ${filter === value ? "border-emerald-600 bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {label} <span className="opacity-80">({count})</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="فلتر قالب الرسالة">
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                القالب:
              </span>
              {(
                [
                  ["all", "الكل", null, null],
                  [
                    "confirmation",
                    "تأكيد الطلب",
                    Package,
                    templateCounts?.confirmation,
                  ],
                  ["returned", "الطلب الراجع", Undo2, templateCounts?.returned],
                ] as const
              ).map(([value, label, Icon, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeTemplateFilter(value)}
                  aria-pressed={templateFilter === value}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-[10px] border px-2 py-1.5 text-[11px] font-medium transition ${templateFilter === value ? "border-sky-600 bg-sky-600 text-white" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {label}
                  {count != null && <span className="opacity-80">({count})</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Inbox className="h-3.5 w-3.5" /> الأحدث أولاً
              </span>
              <span className="inline-flex items-center gap-1">
                {listLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                {visibleConversations.length} من {counts[filter]} نتيجة
                {counts[filter] > conversations.length && " (الأحدث)"}
              </span>
            </div>
            <p className="text-[10px] leading-5 text-muted-foreground">الأعداد تشمل كل المحادثات المطابقة للبحث والقالب؛ تُعرض أحدث 100 نتيجة بعد تطبيق فلتر الحالة.</p>
          </div>
          <div
            className={`flex-1 overflow-y-auto transition-opacity ${listLoading ? "pointer-events-none opacity-40" : ""}`}
          >
            {!listLoading && visibleConversations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">
                لا توجد محادثات مطابقة لهذا الفلتر
              </p>
            )}
            {visibleConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                aria-pressed={selectedId === c.id}
                className={`w-full text-start px-3 py-3 border-b border-s-2 flex items-start gap-3 hover:bg-muted/60 transition-colors ${
                  selectedId === c.id ? "bg-emerald-50/70 border-s-emerald-600 dark:bg-emerald-950/20" : "border-s-transparent"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold ${c.unreadCount > 0 ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {initials(c.customerName, c.phone)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {c.customerName || c.phone}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDay(c.lastMessageAt)} {formatTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">
                      {previewText(c.lastMessagePreview)}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 bg-emerald-600 text-white text-[10px] font-bold rounded-[10px] min-w-5 h-5 px-1.5 flex items-center justify-center">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  {c.customerName && (
                    <span
                      className="text-[10px] text-muted-foreground"
                      dir="ltr"
                    >
                      {c.phone}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── نافذة المحادثة ── */}
        <section
          aria-label="محادثة واتساب"
          className={`min-w-0 min-h-0 flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}
        >
          {!selectedId || !thread ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-muted/10 text-muted-foreground">
              {selectedId ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <div className="rounded-[10px] bg-primary/10 p-4">
                    <MessageCircle className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">اختر محادثة لعرضها</p>
                  <p className="text-xs">ستظهر الرسائل والطلبات المرتبطة هنا</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* رأس المحادثة */}
              <div className="shrink-0 border-b bg-card px-3 sm:px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8 shrink-0"
                    aria-label="العودة إلى قائمة المحادثات"
                    onClick={() => { selectedIdRef.current = null; ++threadRequestId.current; setSelectedId(null); }}
                  >
                    <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                  </Button>
                  <div className="flex-1 min-w-24">
                    <p className="font-bold text-sm truncate">{selectedName}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {thread.conversation.phone}
                    </p>
                  </div>
                  <span
                    title={windowOpen ? "نافذة الرد المجاني مفتوحة من آخر رسالة واردة" : "انتهت نافذة الرد المجاني"}
                    className={`text-[11px] px-2 py-1 rounded-[10px] shrink-0 ${
                      windowOpen
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                    }`}
                  >
                    {windowOpen
                      ? `الرد متاح · ${remaining!.hours}س ${remaining!.minutes}د`
                      : "انتهت نافذة الرد المجاني"}
                  </span>
                </div>

                {/* طلبات الزبون */}
                {thread.orders.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="طلبات الزبون المرتبطة">
                    <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {thread.orders.map((o) => (
                      <Link
                        key={o.id}
                        href={inboxOrderLookupHref(locale, o, thread.conversation.phone)}
                        className="shrink-0 text-[11px] border rounded-[10px] bg-background px-2.5 py-1.5 hover:bg-muted transition-colors"
                        title={o.items}
                      >
                        {formatDay(o.createdAt)} ·{" "}
                        {formatCurrency(o.totalPrice)} ·{" "}
                        {t(`Orders.Status.${o.status}`)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* الرسائل */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/15 p-3 sm:p-4 space-y-3" role="region" aria-label="رسائل واتساب">
                {thread.messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* مربع الرد */}
              <div className="shrink-0 border-t bg-card p-3">
                {windowOpen ? (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                  >
                    {imageFile && (
                      <div className="flex items-center gap-2 rounded-[10px] border p-2 bg-muted/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagePreview ?? ""}
                          alt=""
                          className="w-12 h-12 rounded-[10px] object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {imageFile.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {(imageFile.size / 1024).toFixed(0)} كيلوبايت
                            {replyText.trim() ? " · مع تعليق" : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="shrink-0"
                          onClick={clearImage}
                          aria-label="إزالة الصورة"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleFilePick}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        disabled={sending}
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="إرفاق صورة"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                      <Input
                        aria-label="نص رد واتساب"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={
                          imageFile
                            ? "أضف تعليقاً (اختياري)..."
                            : "اكتب ردك هنا..."
                        }
                        className="flex-1 min-w-0"
                        autoComplete="off"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        aria-label="إرسال رد واتساب"
                        disabled={sending || (!replyText.trim() && !imageFile)}
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4 rtl:-scale-x-100" />
                        )}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-1.5">
                    انتهت نافذة الـ 24 ساعة — لا يمكن إرسال رد حر حتى يراسلك
                    الزبون مجدداً (أو أرسل له قالباً معتمداً من نظام الطلبات)
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ChatsClient;
