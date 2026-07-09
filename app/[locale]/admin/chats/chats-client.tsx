"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  getWaConversations,
  getWaThread,
  sendWaReply,
} from "@/lib/actions/whatsapp.actions";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  Package,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";

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

function StatusTicks({ status }: { status: string }) {
  if (status === "failed")
    return <TriangleAlert className="w-3.5 h-3.5 text-red-300" />;
  if (status === "read")
    return <CheckCheck className="w-3.5 h-3.5 text-sky-300" />;
  if (status === "delivered")
    return <CheckCheck className="w-3.5 h-3.5 opacity-70" />;
  if (status === "sending")
    return <Clock className="w-3 h-3 opacity-70" />;
  return <Check className="w-3.5 h-3.5 opacity-70" />;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] sm:max-w-[65%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          isOut
            ? "bg-emerald-600 text-white rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        } ${msg.status === "failed" ? "ring-2 ring-red-400" : ""}`}
      >
        {msg.type === "image" && msg.mediaId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/whatsapp/media/${msg.mediaId}`}
            alt=""
            className="rounded-lg max-h-64 mb-1"
            loading="lazy"
          />
        )}
        {msg.type === "video" && msg.mediaId && (
          <video
            src={`/api/whatsapp/media/${msg.mediaId}`}
            controls
            className="rounded-lg max-h-64 mb-1"
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
        {msg.type === "unsupported" && (
          <span className="italic opacity-70">رسالة غير مدعومة</span>
        )}
        {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}
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
  initialConversations,
  configured,
}: {
  initialConversations: Conversation[];
  configured: boolean;
}) => {
  const t = useTranslations("Admin");
  const { toast } = useToast();

  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(0);

  // تحديث قائمة المحادثات دورياً
  const refreshList = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const data = await getWaConversations(query || undefined);
      setConversations(data);
    } catch {
      /* تجاهل أخطاء الشبكة العابرة أثناء الاستعلام الدوري */
    }
  }, [query]);

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
    try {
      const data = await getWaThread(selectedId);
      if (data) setThread(data);
    } catch {
      /* تجاهل */
    }
  }, [selectedId]);

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

  const handleSend = async () => {
    if (!selectedId || !replyText.trim() || sending) return;
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

  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <MessageCircle className="w-10 h-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">{t("chats")}</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          واتساب غير مُهيأ لهذه النسخة — أضف المتغيرات WHATSAPP_TOKEN و
          WHATSAPP_PHONE_NUMBER_ID و WHATSAPP_VERIFY_TOKEN و
          WHATSAPP_APP_SECRET في إعدادات Vercel ثم أعد النشر.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t("chats")}</h1>

      <div className="flex h-[calc(100dvh-215px)] min-h-[420px] rounded-lg border overflow-hidden bg-background">
        {/* ── قائمة المحادثات ── */}
        <aside
          className={`w-full md:w-80 md:border-e flex flex-col ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="بحث بالاسم أو الرقم..."
                className="ps-8 h-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">
                لا توجد محادثات بعد — ستظهر هنا عندما يراسلك الزبائن
              </p>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`w-full text-start px-3 py-2.5 border-b flex items-start gap-2 hover:bg-muted/60 transition-colors ${
                  selectedId === c.id ? "bg-muted" : ""
                }`}
              >
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
                      {c.lastMessagePreview ?? ""}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="shrink-0 bg-emerald-600 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  {c.customerName && (
                    <span className="text-[10px] text-muted-foreground" dir="ltr">
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
          className={`flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}
        >
          {!selectedId || !thread ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              {selectedId ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <MessageCircle className="w-8 h-8" />
                  <p className="text-sm">اختر محادثة لعرضها</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* رأس المحادثة */}
              <div className="border-b px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8 shrink-0"
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {selectedName}
                    </p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {thread.conversation.phone}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-1 rounded-full shrink-0 ${
                      windowOpen
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                    }`}
                  >
                    {windowOpen
                      ? `الرد المجاني متاح — متبقي ${remaining!.hours}س ${remaining!.minutes}د`
                      : "انتهت نافذة الرد المجاني"}
                  </span>
                </div>

                {/* طلبات الزبون */}
                {thread.orders.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                    <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {thread.orders.map((o) => (
                      <Link
                        key={o.id}
                        href={`/admin/orders?query=${thread.conversation.phone}`}
                        className="shrink-0 text-[11px] border rounded-full px-2 py-0.5 hover:bg-muted transition-colors"
                        title={o.items}
                      >
                        {formatDay(o.createdAt)} · {formatCurrency(o.totalPrice)} ·{" "}
                        {t(`Orders.Status.${o.status}`)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* الرسائل */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
                {thread.messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* مربع الرد */}
              <div className="border-t p-2">
                {windowOpen ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                  >
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="اكتب ردك هنا..."
                      className="flex-1"
                      autoComplete="off"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={sending || !replyText.trim()}
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 rtl:-scale-x-100" />
                      )}
                    </Button>
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
