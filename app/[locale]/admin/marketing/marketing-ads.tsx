"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { launchVideoSalesAd } from "@/lib/actions/social.actions";
import {
  Rocket,
  Film,
  Target,
  Users,
  Wallet,
  Link2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from "lucide-react";

export type AdsData = {
  ready: boolean;
  adAccountName: string | null;
  pageName: string | null;
  currency: string;
  adsBaseUrl: string | null;
  ctas: { key: string; label: string }[];
  objectives: { key: string; label: string }[];
  pixels: { id: string; name: string }[];
  placementOptions: { key: string; label: string }[];
  videos: {
    id: string;
    caption: string | null;
    videoUrl: string | null;
    createdAt: string;
  }[];
  products: { id: string; name: string; slug: string }[];
  launches: {
    id: string;
    postId: string;
    status: string;
    dailyBudget: number;
    currency: string;
    destinationUrl: string | null;
    cta: string | null;
    adId: string | null;
    error: string | null;
    createdAt: string;
  }[];
};

/** رمز/اسم العملة للعرض (USD → $، IQD → د.ع، غيرها كودها). */
function currencyLabel(code: string) {
  const c = (code || "").toUpperCase();
  if (c === "USD") return "$";
  if (c === "IQD") return "د.ع";
  return c;
}

function fmtAdMoney(amount: number, currency: string) {
  return `${amount.toLocaleString("en-US")} ${currencyLabel(currency)}`;
}

export default function AdsPanel({ data }: { data: AdsData }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [postId, setPostId] = useState<string>(data.videos[0]?.id ?? "");
  const [objective, setObjective] = useState<string>(
    data.objectives[0]?.key ?? "OUTCOME_SALES",
  );
  const [pixelId, setPixelId] = useState<string>(data.pixels[0]?.id ?? "");
  // افتراضياً «استخدام منشور حالي» — يعزّز المنشور الفعلي بتفاعله.
  const [useExistingPost, setUseExistingPost] = useState(true);
  const [productId, setProductId] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [headline, setHeadline] = useState<string>("");
  const [cta, setCta] = useState<string>(data.ctas[0]?.key ?? "BOOK_TRAVEL");
  const [budget, setBudget] = useState<string>("");
  const [ageMin, setAgeMin] = useState<string>("24");
  const [ageMax, setAgeMax] = useState<string>("60");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  // كل المواضع مختارة افتراضياً = مواضع تلقائية (Advantage+).
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>(
    data.placementOptions.map((p) => p.key),
  );

  const togglePlacement = (key: string) =>
    setSelectedPlacements((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const selectedVideo = data.videos.find((v) => v.id === postId);
  const budgetNum = Number(budget) || 0;

  const onPickProduct = (id: string) => {
    setProductId(id);
    const p = data.products.find((x) => x.id === id);
    if (p) {
      const base = data.adsBaseUrl;
      setDestination(base ? `${base}/landing/${p.slug}` : `/landing/${p.slug}`);
      if (!headline.trim()) setHeadline(p.name);
    }
  };

  // كل المواضع مختارة = تلقائي (نرسل قائمة فارغة)؛ غير ذلك = المختارة فقط.
  const placements = useMemo(
    () =>
      selectedPlacements.length === data.placementOptions.length
        ? []
        : selectedPlacements,
    [selectedPlacements, data.placementOptions.length],
  );

  const destOk = /^https?:\/\//i.test(destination) &&
    !/localhost|127\.0\.0\.1|\.local/i.test(destination);

  const isSales = objective === "OUTCOME_SALES";
  // المنشور الحالي لا يقبل زر/رابط — فالمبيعات تحتاج «إنشاء إعلان».
  const salesNeedsCreate = isSales && useExistingPost;
  const canLaunch =
    data.ready &&
    !!postId &&
    budgetNum > 0 &&
    (!isSales || destOk) &&
    !salesNeedsCreate &&
    selectedPlacements.length > 0 &&
    !(isSales && data.pixels.length === 0) &&
    !pending;

  const onLaunch = () =>
    startTransition(async () => {
      const r = await launchVideoSalesAd({
        postId,
        objective: objective as never,
        useExistingPost,
        pixelId: pixelId || undefined,
        destinationUrl: destination.trim(),
        cta: cta as never,
        headline: headline.trim() || undefined,
        dailyBudget: budgetNum,
        ageMin: Number(ageMin) || 18,
        ageMax: Number(ageMax) || 65,
        gender,
        placements: placements as never,
      });
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: r.success ? 8000 : 6000,
      });
      if (r.success) {
        setBudget("");
        router.refresh();
      }
    });

  if (!data.ready) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center space-y-2">
        <Target className="w-8 h-8 mx-auto text-muted-foreground" />
        <p className="font-semibold">اختر صفحة وحساباً إعلانياً أولاً</p>
        <p className="text-sm text-muted-foreground">
          من تبويب «الاتصال» اختر صفحة فيسبوك وحساباً إعلانياً لتفعيل الإعلانات.
        </p>
      </div>
    );
  }

  if (data.videos.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center space-y-2">
        <Film className="w-8 h-8 mx-auto text-muted-foreground" />
        <p className="font-semibold">لا توجد فيديوهات للإعلان</p>
        <p className="text-sm text-muted-foreground">
          انشر فيديو على فيسبوك من تبويب «النشر»، ثم أنشئ إعلاناً منه هنا.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
          <Target className="w-3.5 h-3.5" /> {data.adAccountName}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
          صفحة: {data.pageName}
        </span>
      </div>

      {/* ── هدف الحملة ── */}
      <Section icon={<Target className="w-4 h-4" />} title="هدف الحملة">
        <div className="flex gap-1 flex-wrap">
          {data.objectives.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setObjective(o.key)}
              className={`h-9 px-4 rounded-md border text-sm transition-colors ${
                objective === o.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {objective === "OUTCOME_SALES"
            ? "يحسّن Meta لعرض الإعلان لمن يُرجّح أن يشتري (عبر بكسل حسابك) — يحتاج زر ورابط الهبوط."
            : "يحسّن للتفاعل (مشاهدات وتعليقات) — أرخص للوصول، أقل استهدافاً للشراء."}
        </p>

        {objective === "OUTCOME_SALES" && (
          <div className="mt-3">
            <label className="text-xs text-muted-foreground">
              البكسل (حدث الشراء)
            </label>
            {data.pixels.length === 0 ? (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                لا يوجد بكسل على هذا الحساب — أنشئ بكسلاً في مدير الأحداث أو اختر
                هدف «تفاعل».
              </p>
            ) : (
              <select
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
              >
                {data.pixels.map((px) => (
                  <option key={px.id} value={px.id}>
                    {px.name} ({px.id})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </Section>

      {/* ── الوسائط ── */}
      <Section icon={<Film className="w-4 h-4" />} title="فيديو الإعلان">
        <div className="flex gap-3">
          {selectedVideo?.videoUrl && (
            <video
              src={selectedVideo.videoUrl}
              className="w-24 h-24 rounded-lg border object-cover bg-black shrink-0"
              controls
            />
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <select
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              {data.videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {(v.caption || "فيديو").slice(0, 50).replace(/\n/g, " ")}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {selectedVideo?.caption}
            </p>
          </div>
        </div>
      </Section>

      {/* ── إعداد الإعلان ── */}
      <Section icon={<Film className="w-4 h-4" />} title="إعداد الإعلان">
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setUseExistingPost(true)}
            className={`h-9 px-4 rounded-md border text-sm transition-colors ${
              useExistingPost
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            استخدام منشور حالي
          </button>
          <button
            type="button"
            onClick={() => setUseExistingPost(false)}
            className={`h-9 px-4 rounded-md border text-sm transition-colors ${
              !useExistingPost
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            إنشاء إعلان بزر ورابط
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {useExistingPost
            ? "يعزّز منشورك المنشور فعلاً (بإعجاباته ومشاهداته) — كما هو، بلا زر أو رابط مُضاف (قيد من Meta على المنشورات الحالية)."
            : "يُنشئ إعلاناً جديداً من الفيديو مع زر ورابط (بلا تفاعل المنشور الأصلي)."}
        </p>
        {salesNeedsCreate && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            لإعلان «مبيعات» بزر «حجز الآن» ورابط الهبوط، اختر «إنشاء إعلان بزر
            ورابط» — المنشور الحالي لا يقبل إضافة رابط.
          </p>
        )}
      </Section>

      {/* ── الوجهة (لهدف «مبيعات» فقط) ── */}
      {isSales && (
      <Section icon={<Link2 className="w-4 h-4" />} title="وجهة الزر (صفحة الهبوط)">
        {!data.adsBaseUrl && (
          <p className="text-xs text-amber-600 flex items-center gap-1 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            لم يُضبط META_ADS_BASE_URL في .env — أدخل رابط الإنتاج الكامل يدوياً.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">
              اختر المنتج (يملأ الرابط)
            </label>
            <select
              value={productId}
              onChange={(e) => onPickProduct(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">— اختر منتجاً —</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">زر الحث</label>
            <select
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              {data.ctas.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-2">
          <label className="text-xs text-muted-foreground">
            العنوان (يظهر أسفل الفيديو)
          </label>
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="مثلاً: ساعة الحائط الرقمية — 37,000 د.ع"
            className="mt-1"
          />
        </div>
        <div className="mt-2">
          <label className="text-xs text-muted-foreground">رابط الوجهة</label>
          <Input
            dir="ltr"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="https://store.al-shafaq03.com/landing/..."
            className="mt-1"
          />
          {destination && !destOk && (
            <p className="text-xs text-red-600 mt-1">
              يجب أن يكون رابطاً عاماً (https) وليس localhost.
            </p>
          )}
        </div>
      </Section>
      )}

      {/* ── الجمهور ── */}
      <Section icon={<Users className="w-4 h-4" />} title="الجمهور">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">الموقع</label>
            <div className="mt-1 h-9 rounded-md border bg-muted/40 px-3 flex items-center text-sm">
              العراق 🇮🇶 (كل المحافظات)
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الجنس</label>
            <div className="mt-1 flex gap-1">
              {(
                [
                  ["all", "الكل"],
                  ["male", "ذكور"],
                  ["female", "إناث"],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setGender(k)}
                  className={`flex-1 h-9 rounded-md border text-sm transition-colors ${
                    gender === k
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">العمر من</label>
            <Input
              type="number"
              min={13}
              max={65}
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">العمر إلى</label>
            <Input
              type="number"
              min={13}
              max={65}
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-muted-foreground">
            المنصّات (كلها مختارة = مواضع تلقائية Advantage+)
          </label>
          <div className="mt-1 flex gap-2 flex-wrap">
            {data.placementOptions.map((p) => (
              <PlaceToggle
                key={p.key}
                active={selectedPlacements.includes(p.key)}
                onClick={() => togglePlacement(p.key)}
                label={p.label}
              />
            ))}
          </div>
          {selectedPlacements.length === 0 && (
            <p className="text-xs text-red-600 mt-1">اختر منصّة واحدة على الأقل.</p>
          )}
        </div>
      </Section>

      {/* ── الميزانية ── */}
      <Section icon={<Wallet className="w-4 h-4" />} title="الميزانية">
        <label className="text-xs text-muted-foreground">
          الميزانية اليومية ({currencyLabel(data.currency)}) — عملة حسابك الإعلاني
        </label>
        <Input
          type="number"
          min={0}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder={data.currency === "USD" ? "مثلاً 5" : "مثلاً 10000"}
          className="mt-1 max-w-xs"
        />
        {budgetNum > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            الميزانية اليومية: {fmtAdMoney(budgetNum, data.currency)}
          </p>
        )}
      </Section>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-300">
        يُنشأ الإعلان موقوفاً. لن يُصرف أي مبلغ حتى تراجعه في مدير إعلانات Meta
        وتتأكّد من الميزانية والاستهداف ثم تفعّله من هناك.
      </div>

      <Button onClick={onLaunch} disabled={!canLaunch} className="w-full sm:w-auto">
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Rocket className="w-4 h-4 ml-1.5" /> إنشاء إعلان الفيديو (موقوف)
          </>
        )}
      </Button>

      {/* ── الإعلانات المُنشأة ── */}
      {data.launches.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold">إعلانات الفيديو ({data.launches.length})</h3>
          {data.launches.map((l) => (
            <div
              key={l.id}
              className="rounded-lg border bg-card p-3 flex items-center gap-2 flex-wrap text-sm"
            >
              {l.status === "failed" ? (
                <AlertTriangle className="w-4 h-4 text-red-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
              <span className="font-semibold">
                {fmtAdMoney(l.dailyBudget, l.currency)}/يوم
              </span>
              <span className="text-muted-foreground">
                · {l.status === "failed" ? "فشل" : "أُنشئ موقوفاً"}
              </span>
              {l.destinationUrl && (
                <a
                  href={l.destinationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline truncate max-w-[220px]"
                  dir="ltr"
                >
                  {l.destinationUrl}
                </a>
              )}
              <span className="text-muted-foreground text-xs">
                {new Date(l.createdAt).toLocaleDateString("ar-IQ")}
              </span>
              {l.error && (
                <span className="text-red-600 text-xs w-full">{l.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function PlaceToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
