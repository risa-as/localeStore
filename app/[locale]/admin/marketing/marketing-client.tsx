"use client";

import { useEffect, useState, useTransition } from "react";
// useState is used for the one-time "now" snapshot in Connected.
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  selectMetaPage,
  selectMetaAdAccount,
  disconnectMeta,
  checkMetaPermissions,
  getMetaTokenStatus,
} from "@/lib/actions/meta.actions";
import {
  Megaphone,
  Facebook,
  Instagram,
  Target,
  CheckCircle2,
  Link2,
  Loader2,
  AlertTriangle,
  Link as LinkIcon,
  Send,
  BarChart3,
  CircleDot,
} from "lucide-react";
import PublishPanel, { type Feed, type AdMeta } from "./marketing-publish";
import AdsPanel, { type AdsData } from "./marketing-ads";
import InsightsPanel, {
  type InsightsHealth,
} from "./marketing-insights";

type Status =
  | { configured: boolean; connected: false }
  | {
      configured: boolean;
      connected: true;
      fbUserName: string | null;
      tokenExpires: string | null;
      pages: {
        id: string;
        name: string;
        igId: string | null;
        igUsername: string | null;
      }[];
      adAccounts: { id: string; accountId: string; name: string }[];
      selected: {
        pageId: string | null;
        pageName: string | null;
        igId: string | null;
        igUsername: string | null;
        adAccountId: string | null;
        adAccountName: string | null;
      };
    };

const FLASH: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "تم ربط حساب Meta بنجاح", ok: true },
  cancelled: { text: "أُلغيت عملية الربط", ok: false },
  invalid: { text: "طلب ربط غير صالح — حاول من جديد", ok: false },
  failed: { text: "فشل الربط — تحقق من إعدادات التطبيق في Meta", ok: false },
};

export default function MarketingClient({
  status,
  flash,
  feed,
  adMeta,
  adsData,
}: {
  status: Status;
  flash: string | null;
  feed: Feed | null;
  adMeta: AdMeta | null;
  adsData: AdsData | null;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<
    "connection" | "publish" | "ads" | "insights"
  >(status.connected ? "publish" : "connection");
  // نبضة حالة الإعلانات القادمة من تبويب الأداء — نقطة على التبويب أينما كنت.
  const [insightsHealth, setInsightsHealth] = useState<InsightsHealth>(null);

  useEffect(() => {
    if (flash && FLASH[flash]) {
      toast({
        description: FLASH[flash].text,
        variant: FLASH[flash].ok ? undefined : "destructive",
      });
      // نظّف المعامل من الرابط
      router.replace("/admin/marketing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash]);

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Megaphone className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">التسويق</h1>
          <p className="text-sm text-muted-foreground">
            النشر على فيسبوك وإنستغرام وإطلاق الإعلانات من مكان واحد
          </p>
        </div>
      </div>

      {!status.configured ? (
        <NotConfigured />
      ) : !status.connected ? (
        <NotConnected pending={pending} />
      ) : (
        <>
          {/* تبويبات */}
          <div className="flex gap-1 border-b">
            <TabButton
              active={tab === "publish"}
              onClick={() => setTab("publish")}
              icon={<Send className="w-4 h-4" />}
              label="النشر"
            />
            <TabButton
              active={tab === "ads"}
              onClick={() => setTab("ads")}
              icon={<Megaphone className="w-4 h-4" />}
              label="الإعلانات"
            />
            <TabButton
              active={tab === "insights"}
              onClick={() => setTab("insights")}
              icon={<BarChart3 className="w-4 h-4" />}
              pulse={
                <CircleDot
                  className={`w-2.5 h-2.5 ${
                    insightsHealth === "problem"
                      ? "text-red-500 animate-pulse"
                      : insightsHealth === "running"
                        ? "text-green-500"
                        : "text-muted-foreground/40"
                  }`}
                />
              }
              label="الأداء"
            />
            <TabButton
              active={tab === "connection"}
              onClick={() => setTab("connection")}
              icon={<LinkIcon className="w-4 h-4" />}
              label="الاتصال"
            />
          </div>

          {tab === "publish" ? (
            feed && adMeta ? (
              <PublishPanel feed={feed} adMeta={adMeta} />
            ) : (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            )
          ) : tab === "ads" ? (
            adsData ? (
              <AdsPanel data={adsData} />
            ) : (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            )
          ) : tab === "insights" ? (
            <InsightsPanel onHealth={setInsightsHealth} />
          ) : (
            <Connected
              status={status}
              onSelectPage={(id) =>
                startTransition(async () => {
                  const r = await selectMetaPage(id);
                  toast({
                    description: r.message,
                    variant: r.success ? undefined : "destructive",
                  });
                  router.refresh();
                })
              }
              onSelectAd={(id) =>
                startTransition(async () => {
                  const r = await selectMetaAdAccount(id);
                  toast({
                    description: r.message,
                    variant: r.success ? undefined : "destructive",
                  });
                  router.refresh();
                })
              }
              onDisconnect={() =>
                startTransition(async () => {
                  const r = await disconnectMeta();
                  toast({ description: r.message });
                  router.refresh();
                })
              }
              pending={pending}
            />
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  pulse,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  pulse?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      {pulse}
    </button>
  );
}

function PermissionsCheck() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    granted?: string[];
    missing?: string[];
    message?: string;
  } | null>(null);

  const KEY_PERMS: Record<string, string> = {
    pages_manage_posts: "النشر على صفحة فيسبوك",
    instagram_content_publish: "النشر على إنستغرام",
    ads_management: "إدارة الإعلانات",
  };

  const run = () =>
    startTransition(async () => {
      const r = await checkMetaPermissions();
      setResult(r);
    });

  const missing = result?.missing ?? [];
  const missingKey = missing.filter((m) => KEY_PERMS[m]);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">صلاحيات الحساب</h3>
          <p className="text-xs text-muted-foreground">
            إن فشل النشر بخطأ «Permissions»، افحص الصلاحيات الممنوحة فعلاً.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={run}
          disabled={pending}
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "فحص"}
        </Button>
      </div>

      {result &&
        (!result.ok ? (
          <p className="text-xs text-red-600">{result.message}</p>
        ) : missingKey.length === 0 ? (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> كل صلاحيات النشر والإعلان ممنوحة.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> صلاحيات ناقصة — النشر عبرها
              سيفشل:
            </p>
            <ul className="text-xs space-y-1">
              {missingKey.map((m) => (
                <li key={m} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {KEY_PERMS[m]}{" "}
                  <span className="text-muted-foreground" dir="ltr">
                    ({m})
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              الحل: اضغط «قطع الاتصال» ثم أعد الربط، وفي شاشة فيسبوك امنح هذه
              الصلاحيات واختر صفحتك. إن لم تظهر الصلاحية أصلاً، أضِف منتجها في
              لوحة تطبيق Meta أولاً.
            </p>
          </div>
        ))}
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-3">
      <div className="flex items-center gap-2 text-amber-600">
        <AlertTriangle className="w-5 h-5" />
        <h2 className="font-bold">Meta غير مُهيأ لهذه النسخة</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        أضِف متغيرات البيئة التالية في إعدادات Vercel ثم أعد النشر:
      </p>
      <pre
        dir="ltr"
        className="text-xs bg-muted rounded-lg p-3 overflow-x-auto"
      >
        {`META_APP_ID=...
META_APP_SECRET=...
META_OAUTH_REDIRECT=https://<domain>/api/meta/oauth/callback`}
      </pre>
      <p className="text-xs text-muted-foreground">
        الصلاحيات المطلوبة تحتاج مراجعة تطبيق من Meta قبل الإنتاج، لكنها تعمل في
        وضع التطوير مع حسابات المالك نفسه بلا مراجعة.
      </p>
    </div>
  );
}

function NotConnected({ pending }: { pending: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-6 flex flex-col items-center gap-4 text-center py-12">
      <div className="p-3 rounded-full bg-muted">
        <Link2 className="w-7 h-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="font-bold text-lg">اربط حساب Meta</h2>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          سجّل الدخول بفيسبوك للسماح للنظام بالنشر على صفحتك وحساب إنستغرام
          وإطلاق الإعلانات من حسابك الإعلاني.
        </p>
      </div>
      {/* تنقّل كامل للنافذة (وليس تنقّل client) لأن المسار يحوّل إلى فيسبوك */}
      <Button
        disabled={pending}
        onClick={() => {
          window.location.href = "/api/meta/oauth";
        }}
      >
        <Facebook className="w-4 h-4 ml-1.5" />
        ربط حساب فيسبوك
      </Button>
    </div>
  );
}

function AssetRow({
  active,
  title,
  subtitle,
  onSelect,
  pending,
  icon,
}: {
  active: boolean;
  title: string;
  subtitle?: string | null;
  onSelect: () => void;
  pending: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={pending || active}
      onClick={onSelect}
      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-right transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "hover:bg-muted disabled:opacity-60"
      }`}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{title}</span>
        {subtitle && (
          <span className="block text-xs text-muted-foreground truncate">
            {subtitle}
          </span>
        )}
      </span>
      {active && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
    </button>
  );
}

/** يفكّ مدة بالمللي ثانية إلى أيام/ساعات/دقائق/ثوانٍ. */
function breakdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/**
 * عدّاد انتهاء الاتصال — يقرأ الحالة الحقيقية من Meta لا من قاعدة البيانات.
 *
 * تمييز جوهري: توكن «لا ينتهي» لا يعني اتصالاً أبدياً. Meta تضع
 * data_access_expires_at وبعده تتوقف البيانات وتفشل النداءات رغم صلاحية التوكن.
 * لذا العدّاد يعمل على أقرب حدّ فعلي، ونقول صراحةً أيّ حدّ هو.
 */
function ConnectionCountdown() {
  const [info, setInfo] = useState<Awaited<
    ReturnType<typeof getMetaTokenStatus>
  > | null>(null);
  // القيمة الأولى عبر مُهيّئ كسول (لا استدعاء زمن أثناء الرسم)، ثم تُحدَّث بالمؤقّت.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    getMetaTokenStatus().then((r) => alive && setInfo(r));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!info)
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> جارٍ قراءة مدة الاتصال…
      </p>
    );
  if (!info.ok)
    return (
      <p className="text-xs text-amber-600">
        تعذّرت قراءة مدة الاتصال: {info.message}
      </p>
    );

  const tokenNever = info.expiresAt === null;
  // الحدّ الفعلي = أقرب تاريخ بين انتهاء التوكن وانتهاء الوصول للبيانات.
  const limits = [info.expiresAt, info.dataAccessExpiresAt].filter(
    (x): x is string => !!x,
  );
  if (limits.length === 0)
    return (
      <p className="text-xs text-green-600 dark:text-green-400">
        الاتصال دائم — لا تاريخ انتهاء ولا حدّ للوصول للبيانات.
      </p>
    );

  const deadlineIso = limits.sort()[0];
  const deadline = new Date(deadlineIso).getTime();
  const isDataLimit = deadlineIso === info.dataAccessExpiresAt;
  const remaining = deadline - nowMs;
  const b = breakdown(remaining);
  const urgent = remaining < 7 * 86400000;
  const expired = remaining <= 0;

  return (
    <div className="text-xs space-y-0.5">
      {tokenNever && (
        <p className="text-green-600 dark:text-green-400">
          التوكن نفسه دائم (بلا تاريخ انتهاء).
        </p>
      )}
      <p
        className={
          expired
            ? "text-red-600 font-semibold"
            : urgent
              ? "text-red-600"
              : "text-muted-foreground"
        }
      >
        {expired ? (
          <>
            {isDataLimit ? "انتهى الوصول للبيانات" : "انتهت صلاحية التوكن"} —
            أعِد الربط الآن.
          </>
        ) : (
          <>
            {isDataLimit ? "ينتهي الوصول للبيانات خلال" : "ينتهي التوكن خلال"}{" "}
            <span className="font-semibold tabular-nums" dir="ltr">
              {b.days} يوم {String(b.hours).padStart(2, "0")}:
              {String(b.minutes).padStart(2, "0")}:
              {String(b.seconds).padStart(2, "0")}
            </span>
          </>
        )}
      </p>
      <p className="text-muted-foreground">
        التاريخ: {new Date(deadlineIso).toLocaleString("ar-IQ")}
        {isDataLimit && " — بعده تفشل النداءات حتى لو بقي التوكن صالحاً"}
      </p>
    </div>
  );
}

function Connected({
  status,
  onSelectPage,
  onSelectAd,
  onDisconnect,
  pending,
}: {
  status: Extract<Status, { connected: true }>;
  onSelectPage: (id: string) => void;
  onSelectAd: (id: string) => void;
  onDisconnect: () => void;
  pending: boolean;
}) {
  // مدة الاتصال تُقرأ الآن حيّة من Meta داخل ConnectionCountdown، لا من التاريخ
  // المخزَّن وقت الربط (كان فارغاً أصلاً لهذا التوكن).
  return (
    <div className="space-y-5">
      {/* شريط الحالة */}
      <div className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-sm">
              متصل{status.fbUserName ? ` — ${status.fbUserName}` : ""}
            </p>
            <ConnectionCountdown />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onDisconnect}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "قطع الاتصال"
          )}
        </Button>
      </div>

      {/* فحص الصلاحيات */}
      <PermissionsCheck />

      {/* الصفحات */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Facebook className="w-4 h-4" /> صفحة فيسبوك للنشر
        </h3>
        {status.pages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا توجد صفحات — تأكد أن لديك دوراً على صفحة فيسبوك.
          </p>
        ) : (
          <div className="space-y-2">
            {status.pages.map((p) => (
              <AssetRow
                key={p.id}
                active={status.selected.pageId === p.id}
                title={p.name}
                subtitle={
                  p.igUsername
                    ? `إنستغرام: @${p.igUsername}`
                    : "لا يوجد إنستغرام مرتبط بهذه الصفحة"
                }
                onSelect={() => onSelectPage(p.id)}
                pending={pending}
                icon={
                  p.igUsername ? (
                    <Instagram className="w-4 h-4" />
                  ) : (
                    <Facebook className="w-4 h-4" />
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* الحسابات الإعلانية */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Target className="w-4 h-4" /> الحساب الإعلاني
        </h3>
        {status.adAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا توجد حسابات إعلانية على هذا الحساب.
          </p>
        ) : (
          <div className="space-y-2">
            {status.adAccounts.map((a) => (
              <AssetRow
                key={a.id}
                active={status.selected.adAccountId === a.id}
                title={a.name}
                subtitle={`رقم الحساب: ${a.accountId}`}
                onSelect={() => onSelectAd(a.id)}
                pending={pending}
                icon={<Target className="w-4 h-4" />}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground border-t pt-3">
        النشر وإطلاق الإعلانات (المرحلتان التاليتان) سيستخدمان الصفحة والحساب
        المختارَين أعلاه.
      </p>
    </div>
  );
}
