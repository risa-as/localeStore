"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { launchVideoSalesAd, deleteAdLaunchesBulk } from "@/lib/actions/social.actions";
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
  Trash2,
  ChevronDown,
  ChevronUp,
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
  products: { id: string; name: string; slug: string }[];
  // منشورات فيديو الصفحة القابلة للإعلان — عضوية (بلا زر) أو منشورات إعلانات
  // تحمل زراً/رابطاً (hasCta) قابلة لإعادة الاستخدام.
  pagePosts: {
    storyId: string; // "" = منشور عضوي يُحلّ منشوره وقت الإطلاق
    key: string;
    videoId: string | null;
    socialPostId: string | null; // مطلوب للإطلاق (FK + معرّف الفيديو)
    videoUrl: string | null;
    message: string;
    cta: string | null;
    link: string | null;
    permalink: string | null;
    hasCta: boolean;
  }[];
  launches: {
    id: string;
    postId: string | null;
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

  // المنشور المختار من منشورات الصفحة (يُعرَّف بمفتاحه).
  const [selectedKey, setSelectedKey] = useState<string>(
    data.pagePosts[0]?.key ?? "",
  );
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

  // تحديد سجلات الإعلانات للحذف الجماعي + حد عرض السجل (10 والبقية خلف السلايدر).
  const [selectedLaunches, setSelectedLaunches] = useState<Set<string>>(new Set());
  const [showAllLaunches, setShowAllLaunches] = useState(false);
  const LAUNCHES_PREVIEW_LIMIT = 10;
  const visibleLaunches = showAllLaunches
    ? data.launches
    : data.launches.slice(0, LAUNCHES_PREVIEW_LIMIT);
  const hiddenLaunches = data.launches.length - visibleLaunches.length;

  const togglePlacement = (key: string) =>
    setSelectedPlacements((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const selectedPost =
    data.pagePosts.find((p) => p.key === selectedKey) ?? data.pagePosts[0];
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
  // «إنشاء إعلان» يتطلب فيديو من النظام؛ منشور إعلان على الصفحة (بلا SocialPost)
  // لا يُتاح إلا لإعادة الاستخدام — عندها نُجبر وضع «منشور حالي».
  const canCreateAd = !!selectedPost?.socialPostId;
  const existingMode = useExistingPost || !canCreateAd;
  // في «منشور حالي»: إن حمل المنشور زراً/رابطاً (منشور إعلان) نعيد استخدامه —
  // فيرث الزر والرابط. المنشور العضوي وحده لا يحمل زراً.
  const reuseStoryId =
    existingMode && selectedPost?.hasCta ? selectedPost.storyId : "";
  const reusing = !!reuseStoryId;
  // «مبيعات» بوضع «منشور حالي» تحتاج منشوراً يحمل زراً، وإلا «إنشاء إعلان».
  const salesNeedsCreate = isSales && existingMode && !reusing;
  const canLaunch =
    data.ready &&
    !!selectedPost &&
    (canCreateAd || reusing) &&
    budgetNum > 0 &&
    (!isSales || reusing || destOk) &&
    !salesNeedsCreate &&
    selectedPlacements.length > 0 &&
    !(isSales && data.pixels.length === 0) &&
    !pending;

  const onLaunch = () =>
    startTransition(async () => {
      const r = await launchVideoSalesAd({
        socialPostId: selectedPost?.socialPostId || undefined,
        objective: objective as never,
        useExistingPost: existingMode,
        reuseStoryId: reuseStoryId || undefined,
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

  if (data.pagePosts.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center space-y-2">
        <Film className="w-8 h-8 mx-auto text-muted-foreground" />
        <p className="font-semibold">لا توجد منشورات فيديو للإعلان</p>
        <p className="text-sm text-muted-foreground">
          انشر فيديو على فيسبوك من تبويب «النشر»، ثم أنشئ إعلاناً منه هنا.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full">
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

      {/* ── منشور الإعلان (منشورات فيديو الصفحة) ── */}
      <Section icon={<Film className="w-4 h-4" />} title="منشور الإعلان">
        <div className="flex gap-3">
          {selectedPost?.videoUrl ? (
            <video
              src={selectedPost.videoUrl}
              className="w-24 h-24 rounded-lg border object-cover bg-black shrink-0"
              controls
            />
          ) : selectedPost?.permalink ? (
            <a
              href={selectedPost.permalink}
              target="_blank"
              rel="noreferrer"
              className="w-24 h-24 rounded-lg border bg-muted flex items-center justify-center shrink-0 text-xs text-muted-foreground hover:bg-muted/70"
            >
              مشاهدة
            </a>
          ) : null}
          <div className="flex-1 min-w-0 space-y-2">
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              {data.pagePosts.map((p) => (
                <option key={p.key} value={p.key}>
                  {(p.hasCta ? "🔗 " : "") +
                    (p.message || "فيديو").slice(0, 50).replace(/\n/g, " ")}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {selectedPost?.hasCta ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" /> يحمل زراً ورابطاً
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground">
                  منشور عضوي (بلا زر)
                </span>
              )}
              {!selectedPost?.socialPostId &&
                (selectedPost?.hasCta ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    منشور إعلان على الصفحة — يُعاد استخدامه فقط
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="w-3 h-3" /> غير منشور من النظام وبلا
                    زر — غير قابل للإطلاق
                  </span>
                ))}
            </div>
            {selectedPost?.hasCta && selectedPost.link && (
              <p
                className="text-xs text-muted-foreground truncate"
                dir="ltr"
              >
                {selectedPost.link}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          منشورات الفيديو على صفحتك — العضوية وتلك التي أُعلن عنها سابقاً (تحمل
          زراً/رابطاً 🔗). لإعلان «مبيعات» بوضع «استخدام منشور حالي»، اختر منشوراً
          يحمل زراً.
        </p>
      </Section>

      {/* ── إعداد الإعلان ── */}
      <Section icon={<Film className="w-4 h-4" />} title="إعداد الإعلان">
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setUseExistingPost(true)}
            className={`h-9 px-4 rounded-md border text-sm transition-colors ${
              existingMode
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            استخدام منشور حالي
          </button>
          <button
            type="button"
            disabled={!canCreateAd}
            onClick={() => canCreateAd && setUseExistingPost(false)}
            className={`h-9 px-4 rounded-md border text-sm transition-colors ${
              !existingMode
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            } ${!canCreateAd ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            إنشاء إعلان بزر ورابط
          </button>
        </div>
        {!canCreateAd && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            هذا المنشور غير منشور من النظام — «إنشاء إعلان» غير متاح؛ يُعاد
            استخدامه فقط.
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {existingMode
            ? "يعزّز المنشور المختار بتفاعله (إعجاباته ومشاهداته). إن كان يحمل زراً/رابطاً (🔗) يُورَّثان للإعلان — وهذا ما تحتاجه «المبيعات»."
            : "يُنشئ إعلاناً جديداً من فيديو المنشور مع زر ورابط (بلا تفاعل المنشور الأصلي)."}
        </p>

        {reusing && selectedPost?.link && (
          <p className="text-xs text-green-700 dark:text-green-400 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            سيُعاد استخدام هذا المنشور بزره ورابطه:
            <span dir="ltr" className="truncate">
              {selectedPost.link}
            </span>
          </p>
        )}

        {salesNeedsCreate && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            لإعلان «مبيعات» بوضع «منشور حالي»: اختر منشوراً يحمل زراً/رابطاً (🔗)
            من القائمة أعلاه، أو استخدم «إنشاء إعلان بزر ورابط».
          </p>
        )}
      </Section>

      {/* ── الوجهة — لهدف «مبيعات» عند «إنشاء إعلان» فقط (عند إعادة استخدام منشور
          إعلان، الزر والرابط موروثان منه). ── */}
      {isSales && !reusing && (
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

      {/* ── الإعلانات المُنشأة ── بطاقات بحافة ملونة: نجح أو فشل بنظرة ── */}
      {data.launches.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">
              إعلانات الفيديو ({data.launches.length})
            </h3>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                تابعها وفعّلها من تبويب «الأداء»
              </p>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary"
                  checked={
                    selectedLaunches.size === data.launches.length &&
                    data.launches.length > 0
                  }
                  onChange={(e) =>
                    setSelectedLaunches(
                      e.target.checked
                        ? new Set(data.launches.map((l) => l.id))
                        : new Set(),
                    )
                  }
                />
                تحديد الكل
              </label>
              {selectedLaunches.size > 0 && (
                <span className="text-xs text-primary font-medium">
                  {selectedLaunches.size} محدد
                </span>
              )}
            </div>
          </div>

          {/* شريط الحذف الجماعي — يظهر فقط عند وجود تحديد */}
          {selectedLaunches.size > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-red-700 dark:text-red-400">
                سيُحذف السجل المحدد ({selectedLaunches.size}) من هذا السجل فقط —
                الإعلان نفسه يبقى على Meta ويُدار من تبويب «الأداء».
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedLaunches(new Set())}
                  disabled={pending}
                >
                  إلغاء التحديد
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await deleteAdLaunchesBulk([...selectedLaunches]);
                      toast({
                        description: r.message,
                        variant: r.success ? undefined : "destructive",
                      });
                      if (r.success) setSelectedLaunches(new Set());
                      router.refresh();
                    })
                  }
                >
                  {pending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 ml-1" /> حذف المحدد ({selectedLaunches.size})
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {visibleLaunches.map((l) => {
              const failed = l.status === "failed";
              const checked = selectedLaunches.has(l.id);
              return (
                <div
                  key={l.id}
                  className={`rounded-lg border bg-card p-3 border-s-4 flex flex-col gap-2 ${
                    failed ? "border-s-red-500" : "border-s-green-500"
                  } ${checked ? "border-primary/60 ring-1 ring-primary/30" : ""}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary shrink-0 cursor-pointer"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedLaunches((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(l.id);
                          else next.delete(l.id);
                          return next;
                        })
                      }
                      aria-label="تحديد سجل الإعلان للحذف الجماعي"
                    />
                    {failed ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2 py-0.5 text-xs">
                        <AlertTriangle className="w-3 h-3" /> فشل
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs">
                        <CheckCircle2 className="w-3 h-3" /> أُنشئ موقوفاً
                      </span>
                    )}
                    <span className="font-semibold text-sm">
                      {fmtAdMoney(l.dailyBudget, l.currency)}/يوم
                    </span>
                    <span className="ms-auto text-xs text-muted-foreground">
                      {new Date(l.createdAt).toLocaleDateString("ar-IQ")}
                    </span>
                  </div>
                  {l.destinationUrl && (
                    <a
                      href={l.destinationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline truncate"
                      dir="ltr"
                    >
                      {l.destinationUrl}
                    </a>
                  )}
                  {l.error && (
                    <p className="text-xs text-red-600 leading-snug">{l.error}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* زر فتح بقية سجل الإعلانات */}
          {hiddenLaunches > 0 && (
            <button
              type="button"
              onClick={() => setShowAllLaunches(true)}
              className="w-full py-2.5 text-xs text-primary hover:bg-muted rounded-lg border border-dashed flex items-center justify-center gap-1.5 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              عرض بقية السجل ({hiddenLaunches} إعلان)
            </button>
          )}
          {showAllLaunches && data.launches.length > LAUNCHES_PREVIEW_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAllLaunches(false)}
              className="w-full py-2 text-[11px] text-muted-foreground hover:bg-muted rounded-lg border border-dashed flex items-center justify-center gap-1.5 transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              إظهار آخر {LAUNCHES_PREVIEW_LIMIT} فقط
            </button>
          )}
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
