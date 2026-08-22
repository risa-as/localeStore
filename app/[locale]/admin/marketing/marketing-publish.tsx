"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  publishPost,
  deleteSocialPost,
  launchAd,
} from "@/lib/actions/social.actions";
import { formatCurrency } from "@/lib/utils";
import {
  Facebook,
  Instagram,
  Loader2,
  Megaphone,
  Send,
  Trash2,
  X,
  ExternalLink,
  Rocket,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export type Feed = {
  ready: { facebook: boolean; instagram: boolean; ads: boolean };
  selected: {
    pageName: string | null;
    igUsername: string | null;
    adAccountName: string | null;
  };
  posts: {
    id: string;
    caption: string | null;
    imageUrls: string[];
    platforms: string[];
    status: string;
    fbPostId: string | null;
    igPostId: string | null;
    error: string | null;
    createdAt: string;
    launches: {
      id: string;
      status: string;
      objective: string;
      dailyBudget: number;
      currency: string;
      adId: string | null;
      error: string | null;
      createdAt: string;
    }[];
  }[];
  products: { id: string; name: string; images: string[]; offers: string | null }[];
};

export type AdMeta = {
  objectives: { key: string; label: string }[];
  iqdOffset: number;
};

export default function PublishPanel({
  feed,
  adMeta,
}: {
  feed: Feed;
  adMeta: AdMeta;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [productId, setProductId] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageInput, setImageInput] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(
    feed.ready.facebook ? ["facebook"] : [],
  );
  const [boostFor, setBoostFor] = useState<string | null>(null);

  const onPickProduct = (id: string) => {
    setProductId(id);
    const p = feed.products.find((x) => x.id === id);
    if (p) {
      setImages(p.images.slice(0, 10));
      setCaption(
        [p.name, p.offers].filter(Boolean).join("\n\n").trim() || caption,
      );
    }
  };

  const togglePlatform = (p: string) =>
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const addImageUrl = () => {
    const url = imageInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({ variant: "destructive", description: "أدخل رابط صورة صحيحاً" });
      return;
    }
    setImages((prev) => [...prev, url]);
    setImageInput("");
  };

  const canPublish =
    platforms.length > 0 &&
    (caption.trim().length > 0 || images.length > 0) &&
    !(platforms.includes("instagram") && images.length === 0);

  const onPublish = () =>
    startTransition(async () => {
      const r = await publishPost({
        caption,
        imageUrls: images,
        platforms,
        productId: productId || null,
      });
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
      });
      if (r.success) {
        setCaption("");
        setImages([]);
        setProductId("");
      }
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {/* الحالة */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip
          on={feed.ready.facebook}
          label={
            feed.selected.pageName
              ? `فيسبوك: ${feed.selected.pageName}`
              : "لا صفحة"
          }
          icon={<Facebook className="w-3.5 h-3.5" />}
        />
        <Chip
          on={feed.ready.instagram}
          label={
            feed.selected.igUsername
              ? `إنستغرام: @${feed.selected.igUsername}`
              : "لا إنستغرام"
          }
          icon={<Instagram className="w-3.5 h-3.5" />}
        />
        <Chip
          on={feed.ready.ads}
          label={
            feed.selected.adAccountName
              ? `إعلانات: ${feed.selected.adAccountName}`
              : "لا حساب إعلاني"
          }
          icon={<Megaphone className="w-3.5 h-3.5" />}
        />
      </div>

      {/* المؤلّف */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <h3 className="font-semibold text-sm">منشور جديد</h3>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">
              من منتج (اختياري — يملأ الصور والوصف)
            </label>
            <select
              value={productId}
              onChange={(e) => onPickProduct(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">— بدون منتج —</option>
              {feed.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">المنصّات</label>
            <div className="mt-1 flex gap-2">
              <PlatformToggle
                active={platforms.includes("facebook")}
                disabled={!feed.ready.facebook}
                onClick={() => togglePlatform("facebook")}
                icon={<Facebook className="w-4 h-4" />}
                label="فيسبوك"
              />
              <PlatformToggle
                active={platforms.includes("instagram")}
                disabled={!feed.ready.instagram}
                onClick={() => togglePlatform("instagram")}
                icon={<Instagram className="w-4 h-4" />}
                label="إنستغرام"
              />
            </div>
          </div>
        </div>

        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="اكتب نص المنشور..."
          rows={4}
        />

        {/* الصور */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={`${url}-${i}`} className="relative">
                <Image
                  src={url}
                  alt=""
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-md object-cover border"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() =>
                    setImages((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="absolute -top-1.5 -right-1.5 bg-background border rounded-full p-0.5"
                  aria-label="إزالة"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={imageInput}
            onChange={(e) => setImageInput(e.target.value)}
            placeholder="أضف رابط صورة (https://...)"
            className="flex-1"
            dir="ltr"
          />
          <Button type="button" variant="outline" onClick={addImageUrl}>
            إضافة
          </Button>
        </div>

        {platforms.includes("instagram") && images.length === 0 && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> إنستغرام يتطلب صورة واحدة
            على الأقل
          </p>
        )}

        <Button onClick={onPublish} disabled={!canPublish || pending}>
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 ml-1.5" /> نشر
            </>
          )}
        </Button>
      </div>

      {/* المنشورات */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">المنشورات ({feed.posts.length})</h3>
        {feed.posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد منشورات بعد.</p>
        ) : (
          feed.posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              canLaunch={feed.ready.ads}
              onBoost={() => setBoostFor(post.id)}
              onDelete={() =>
                startTransition(async () => {
                  const r = await deleteSocialPost(post.id);
                  toast({ description: r.message });
                  router.refresh();
                })
              }
              pending={pending}
            />
          ))
        )}
      </div>

      {boostFor && (
        <BoostDialog
          postId={boostFor}
          adMeta={adMeta}
          onClose={() => setBoostFor(null)}
          onLaunched={() => {
            setBoostFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Chip({
  on,
  label,
  icon,
}: {
  on: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
        on
          ? "border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400"
          : "border-border text-muted-foreground"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}

function PlatformToggle({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "غير متاح — اربط الأصل أولاً" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted disabled:opacity-40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  published: { text: "منشور", cls: "text-green-600" },
  partial: { text: "جزئي", cls: "text-amber-600" },
  failed: { text: "فشل", cls: "text-red-600" },
  draft: { text: "مسودة", cls: "text-muted-foreground" },
};

function PostRow({
  post,
  canLaunch,
  onBoost,
  onDelete,
  pending,
}: {
  post: Feed["posts"][number];
  canLaunch: boolean;
  onBoost: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const st = STATUS_LABEL[post.status] ?? STATUS_LABEL.draft;
  return (
    <div className="rounded-lg border bg-card p-3 flex gap-3">
      {post.imageUrls[0] ? (
        <Image
          src={post.imageUrls[0]}
          alt=""
          width={56}
          height={56}
          className="w-14 h-14 rounded object-cover border shrink-0"
          unoptimized
        />
      ) : (
        <div className="w-14 h-14 rounded bg-muted shrink-0" />
      )}

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm line-clamp-2">{post.caption || "—"}</p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span className={`font-semibold ${st.cls}`}>{st.text}</span>
          {post.platforms.includes("facebook") && (
            <Facebook className="w-3.5 h-3.5" />
          )}
          {post.platforms.includes("instagram") && (
            <Instagram className="w-3.5 h-3.5" />
          )}
          {post.fbPostId && (
            <a
              href={`https://facebook.com/${post.fbPostId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 hover:text-foreground"
            >
              فيسبوك <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <span>· {new Date(post.createdAt).toLocaleDateString("ar-IQ")}</span>
        </div>
        {post.error && (
          <p className="text-xs text-red-600 line-clamp-1">{post.error}</p>
        )}
        {post.launches.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {post.launches.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 text-[11px] rounded-full border px-2 py-0.5"
                title={l.error ?? undefined}
              >
                {l.status === "failed" ? (
                  <AlertTriangle className="w-3 h-3 text-red-600" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                )}
                إعلان · {formatCurrency(l.dailyBudget)}/يوم ·{" "}
                {l.status === "failed" ? "فشل" : "موقوف"}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          disabled={!canLaunch || !post.fbPostId || pending}
          onClick={onBoost}
          title={
            !post.fbPostId
              ? "انشر على فيسبوك أولاً لإطلاق إعلان"
              : !canLaunch
                ? "اختر حساباً إعلانياً أولاً"
                : undefined
          }
        >
          <Rocket className="w-3.5 h-3.5 ml-1" /> إعلان
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={pending}
          aria-label="حذف السجل"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function BoostDialog({
  postId,
  adMeta,
  onClose,
  onLaunched,
}: {
  postId: string;
  adMeta: AdMeta;
  onClose: () => void;
  onLaunched: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [objective, setObjective] = useState(
    adMeta.objectives[0]?.key ?? "OUTCOME_TRAFFIC",
  );
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("");

  const budgetNum = Number(budget) || 0;
  const minor = useMemo(
    () => budgetNum * adMeta.iqdOffset,
    [budgetNum, adMeta.iqdOffset],
  );

  const onLaunch = () =>
    startTransition(async () => {
      const r = await launchAd({
        postId,
        objective: objective as never,
        dailyBudget: budgetNum,
        days: days ? Number(days) : undefined,
      });
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: r.success ? 8000 : 5000,
      });
      if (r.success) onLaunched();
    });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" /> إطلاق إعلان
          </h3>
          <button onClick={onClose} aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">الهدف</label>
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
          >
            {adMeta.objectives.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">
              الميزانية اليومية (د.ع)
            </label>
            <Input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="مثلاً 10000"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              عدد الأيام (اختياري)
            </label>
            <Input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="مفتوح"
              className="mt-1"
            />
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="flex items-center gap-1 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" /> يُنشأ الإعلان موقوفاً
          </p>
          <p>
            لن يُصرف أي مبلغ تلقائياً. راجع الإعلان في مدير إعلانات Meta وتأكّد من
            الميزانية ثم فعّله من هناك.
          </p>
          {budgetNum > 0 && (
            <p className="opacity-80">
              (سيُرسل إلى Meta {minor.toLocaleString()} وحدة صغرى — تحقّق أن هذا
              يعادل {formatCurrency(budgetNum)} في مدير الإعلانات)
            </p>
          )}
        </div>

        <Button
          onClick={onLaunch}
          disabled={pending || budgetNum <= 0}
          className="w-full"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "إنشاء الإعلان (موقوف)"
          )}
        </Button>
      </div>
    </div>
  );
}
