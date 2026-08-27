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
} from "lucide-react";
import PublishPanel, { type Feed, type AdMeta } from "./marketing-publish";
import AdsPanel, { type AdsData } from "./marketing-ads";
import InsightsPanel from "./marketing-insights";

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
            <InsightsPanel />
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
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
  // لقطة زمنية مرة واحدة — لا نستدعي Date.now() أثناء الرسم (دالة غير نقية).
  const [now] = useState(() => Date.now());
  const expires = status.tokenExpires ? new Date(status.tokenExpires) : null;
  const daysLeft = expires
    ? Math.round((expires.getTime() - now) / (24 * 3600 * 1000))
    : null;

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
            {daysLeft !== null && (
              <p
                className={`text-xs ${daysLeft <= 7 ? "text-red-600" : "text-muted-foreground"}`}
              >
                صلاحية التوكن تنتهي خلال {daysLeft} يوم
                {daysLeft <= 7 ? " — أعِد الربط قريباً" : ""}
              </p>
            )}
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
