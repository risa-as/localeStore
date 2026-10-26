"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  publishPost,
  deleteSocialPost,
  deleteSocialPostsBulk,
  launchAd,
  finishInstagramVideo,
} from "@/lib/actions/social.actions";
import { UploadButton } from "@/lib/uploadthing";
import "./marketing-effects.css";
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
  ChevronDown,
  ChevronUp,
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
    videoUrls: string[];
    platforms: string[];
    status: string;
    fbPostId: string | null;
    igPostId: string | null;
    error: string | null;
    needsIgFinish: boolean;
    productId: string | null;
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
  products: {
    id: string;
    name: string;
    images: string[];
    description: string | null;
  }[];
};

export type AdMeta = {
  objectives: { key: string; label: string }[];
};

/**
 * ميزانية الإعلان تُخزَّن بوحدة العملة الكاملة (د.ع)، بينما formatCurrency يضرب
 * ×1000 لأن أسعار المنتجات تُخزَّن بالآلاف. لذا نُنسّق مبالغ الإعلانات هنا بشكل
 * مباشر ولا نمرّرها عبر formatCurrency.
 */
function fmtAdMoney(amount: number, currency = "د.ع") {
  return `${amount.toLocaleString("en-US")} ${currency}`;
}

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
  const [videos, setVideos] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(
    feed.ready.facebook ? ["facebook"] : [],
  );
  const [boostFor, setBoostFor] = useState<string | null>(null);

  // حالة الرفع لعرض مؤشّر صغير مع عدّاد مكان الوسيط.
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  // تأكيد صريح على النشر بلا منتج (يظهر كتحذير داخل النموذج).
  const [confirmNoProduct, setConfirmNoProduct] = useState(false);
  // تحديد المنشورات للحذف الجماعي من السجل — مجموعة ids المحددة.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // حد عرض السجل: 10 منشورات ظاهرة والبقية خلف زر «عرض بقية السجل».
  const [showAll, setShowAll] = useState(false);
  const POSTS_PREVIEW_LIMIT = 10;
  const visiblePosts = showAll
    ? feed.posts
    : feed.posts.slice(0, POSTS_PREVIEW_LIMIT);
  const hiddenCount = feed.posts.length - visiblePosts.length;

  const hasVideo = videos.length > 0;

  const onPickProduct = (id: string) => {
    setProductId(id);
    const p = feed.products.find((x) => x.id === id);
    if (p) {
      // يملأ الوصف من رابط المنتج (وليس العروض) والصور — إن لم يكن هناك فيديو.
      setCaption(
        [p.name, p.description].filter(Boolean).join("\n\n").trim() || caption,
      );
      if (!hasVideo) setImages(p.images.slice(0, 10));
    }
  };

  const togglePlatform = (p: string) =>
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  // إنستغرام يقبل JPEG فقط للصور.
  const nonJpegForIg =
    platforms.includes("instagram") &&
    !hasVideo &&
    images.some((u) => !/\.jpe?g($|\?)/i.test(u));

  const canPublish =
    platforms.length > 0 &&
    (caption.trim().length > 0 || images.length > 0 || hasVideo) &&
    !(platforms.includes("instagram") && images.length === 0 && !hasVideo) &&
    !nonJpegForIg &&
    !pending;

  const onPublish = (confirmNoProduct = false) =>
    startTransition(async () => {
      const r = await publishPost({
        caption,
        imageUrls: images,
        videoUrls: videos,
        platforms,
        productId: productId || null,
        confirmNoProduct,
      });
      // رفض بلا منتج: رسالة فيها noProductConfirm — لا نُكرّر التوست، الواجهة
      // تعرض تأكيداً داخلياً بدلها.
      if ((r as { noProductConfirm?: boolean }).noProductConfirm) {
        setConfirmNoProduct(true);
        return;
      }
      toast({
        description: r.message,
        variant: r.success ? undefined : "destructive",
        duration: r.success ? 7000 : 5000,
      });
      if (r.success) {
        setCaption("");
        setImages([]);
        setVideos([]);
        setProductId("");
        setConfirmNoProduct(false);
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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* المؤلّف */}
      <div className="min-w-0 rounded-xl border bg-card p-4 space-y-4">
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

        {/* معاينة الصور */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={`${url}-${i}`} className="relative mk-pop">
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
                  aria-label="إزالة الصورة"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* معاينة الفيديو */}
        {videos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {videos.map((url, i) => (
              <div key={`${url}-${i}`} className="relative mk-pop">
                <video
                  src={url}
                  className="w-28 h-28 rounded-md object-cover border bg-black"
                  controls
                />
                <button
                  type="button"
                  onClick={() =>
                    setVideos((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="absolute -top-1.5 -right-1.5 bg-background border rounded-full p-0.5"
                  aria-label="إزالة الفيديو"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* مؤشّر الرفع: بلاطة صغيرة مكان الوسيط تختفي عند الاكتمال */}
        {uploading && (
          <div className="flex flex-wrap gap-2">
            <div className="mk-upload-tile" role="status" aria-label="جارٍ الرفع">
              <UploadSpinner pct={uploadPct} />
            </div>
          </div>
        )}

        {/* الرفع من الكمبيوتر */}
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton
            endpoint="mediaUploader"
            appearance={{
              button:
                "ut-ready:bg-primary ut-uploading:cursor-not-allowed bg-primary text-primary-foreground text-sm rounded-md px-3 h-9",
              allowedContent: "text-xs text-muted-foreground",
            }}
            content={{ button: "رفع صورة/فيديو" }}
            onUploadBegin={() => {
              setUploading(true);
              setUploadPct(0);
            }}
            onUploadProgress={(p: number) => setUploadPct(Math.round(p))}
            onClientUploadComplete={(
              res: { url: string; type?: string; name?: string }[],
            ) => {
              setUploading(false);
              const isVid = (r: { type?: string; name?: string; url: string }) =>
                (r.type?.startsWith("video")) ||
                /\.(mp4|mov|webm|m4v)($|\?)/i.test(r.name || r.url);
              const vids = res.filter(isVid).map((r) => r.url);
              const imgs = res.filter((r) => !isVid(r)).map((r) => r.url);
              if (vids.length) {
                // فيديو واحد فقط، ولا يُدمج مع صور.
                setVideos([vids[0]]);
                setImages([]);
                if (imgs.length)
                  toast({
                    description: "لا يمكن دمج فيديو وصور — تم اعتماد الفيديو",
                  });
              } else if (imgs.length) {
                if (hasVideo) {
                  toast({
                    variant: "destructive",
                    description: "أزِل الفيديو أولاً لإضافة صور",
                  });
                } else {
                  setImages((prev) => [...prev, ...imgs]);
                }
              }
            }}
            onUploadError={(error: Error) => {
              setUploading(false);
              toast({ variant: "destructive", description: error.message });
            }}
          />
        </div>

        {hasVideo && (
          <p className="text-xs text-muted-foreground">
            منشور فيديو — لا يمكن إضافة صور معه. تعزيز الإعلان غير متاح لمنشورات
            الفيديو.
          </p>
        )}
        {platforms.includes("instagram") && images.length === 0 && !hasVideo && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> إنستغرام يتطلب صورة أو
            فيديو
          </p>
        )}
        {nonJpegForIg && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> إنستغرام يقبل JPEG فقط —
            أزِل صور PNG/WEBP أو ألغِ اختيار إنستغرام
          </p>
        )}

        {!productId && confirmNoProduct && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 flex-wrap">
            <span>
              ستُنشر دون ربط بمنتج — لن يُربط صرف إعلانها لاحقاً تلقائياً. أنصح
              باختيار منتج.
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmNoProduct(false)}
                disabled={pending}
              >
                رجوع واختيار منتج
              </Button>
              <Button size="sm" onClick={() => onPublish(true)} disabled={pending}>
                {pending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "تأكيد النشر بلا منتج"
                )}
              </Button>
            </span>
          </div>
        )}

        <Button
          onClick={() => (productId ? onPublish(false) : setConfirmNoProduct(true))}
          disabled={!canPublish}
        >
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
      <div className="min-w-0 space-y-3 rounded-[10px] border bg-card p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm">المنشورات ({feed.posts.length})</h3>
          {feed.posts.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary"
                  checked={selected.size === feed.posts.length && feed.posts.length > 0}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(feed.posts.map((p) => p.id))
                        : new Set(),
                    )
                  }
                />
                تحديد الكل
              </label>
              {selected.size > 0 && (
                <span className="text-xs text-primary font-medium">
                  {selected.size} محدد
                </span>
              )}
            </div>
          )}
        </div>

        {/* شريط الحذف الجماعي — يظهر فقط عند وجود تحديد */}
        {selected.size > 0 && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-red-700 dark:text-red-400">
              سيُحذف السجل المحدد ({selected.size}) من لوحة النشر فقط — المنشورات
              تبقى على فيسبوك/إنستغرام.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set())}
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
                    const r = await deleteSocialPostsBulk([...selected]);
                    toast({
                      description: r.message,
                      variant: r.success ? undefined : "destructive",
                    });
                    if (r.success) setSelected(new Set());
                    router.refresh();
                  })
                }
              >
                {pending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 ml-1" /> حذف المحدد ({selected.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {feed.posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد منشورات بعد.</p>
        ) : (
          <>
            {visiblePosts.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                canLaunch={feed.ready.ads}
                checked={selected.has(post.id)}
                onCheck={(on) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(post.id);
                    else next.delete(post.id);
                    return next;
                  })
                }
                onBoost={() => setBoostFor(post.id)}
                onDelete={() =>
                  startTransition(async () => {
                    const r = await deleteSocialPost(post.id);
                    toast({ description: r.message });
                    router.refresh();
                  })
                }
                onFinishIg={() =>
                  startTransition(async () => {
                    const r = await finishInstagramVideo(post.id);
                    toast({
                      description: r.message,
                      variant: r.success ? undefined : "destructive",
                    });
                    router.refresh();
                  })
                }
                pending={pending}
              />
            ))}

            {/* زر فتح بقية السجل — يظهر فقط عند وجود منشورات مخفية */}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full py-2.5 text-xs text-primary hover:bg-muted rounded-lg border border-dashed flex items-center justify-center gap-1.5 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                عرض بقية السجل ({hiddenCount} منشور)
              </button>
            )}
            {showAll && feed.posts.length > POSTS_PREVIEW_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="w-full py-2 text-[11px] text-muted-foreground hover:bg-muted rounded-lg border border-dashed flex items-center justify-center gap-1.5 transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                إظهار آخر {POSTS_PREVIEW_LIMIT} فقط
              </button>
            )}
          </>
        )}
      </div>
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

/** حلقة من 8 خطوط شعاعية تبهت بالتتابع، مع عدّاد النسبة في المنتصف. */
function UploadSpinner({ pct }: { pct: number }) {
  return (
    <span className="mk-spinner">
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            transform: `rotate(${i * 45}deg)`,
            animationDelay: `${-0.1 * (8 - i)}s`,
          }}
        />
      ))}
      <span className="mk-spinner-pct">{pct}%</span>
    </span>
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
  pending_ig: { text: "فيديو إنستغرام قيد المعالجة", cls: "text-blue-600" },
};

function PostRow({
  post,
  canLaunch,
  checked,
  onCheck,
  onBoost,
  onDelete,
  onFinishIg,
  pending,
}: {
  post: Feed["posts"][number];
  canLaunch: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onBoost: () => void;
  onDelete: () => void;
  onFinishIg: () => void;
  pending: boolean;
}) {
  const st = STATUS_LABEL[post.status] ?? STATUS_LABEL.draft;
  const isVideo = post.videoUrls.length > 0;
  // نفس لغة بطاقة إعلان الفيديو: حافة يسرى بلون الحالة (أخضر نجاح / أحمر فشل /
  // كهرماني جزئي أو معالجة / رمادي مسودة).
  const failed = post.status === "failed";
  const partial = post.status === "partial" || post.status === "pending_ig";
  const edge = failed
    ? "border-s-red-500"
    : partial
      ? "border-s-amber-500"
      : post.status === "published"
        ? "border-s-green-500"
        : "border-s-muted-foreground/40";
  const hasAnyLaunch = post.launches.length > 0;
  const primaryLaunch = post.launches[0];
  const moreLaunches = post.launches.length - 1;
  return (
    <div
      className={`rounded-lg border bg-card border-s-4 p-3 flex gap-3 transition-all hover:shadow-sm ${
        edge
      } ${
        checked ? "border-primary/60 ring-1 ring-primary/30" : ""
      }`}
    >
      <input
        type="checkbox"
        className="w-4 h-4 accent-primary shrink-0 mt-1 cursor-pointer"
        checked={checked}
        onChange={(e) => onCheck(e.target.checked)}
        aria-label="تحديد السجل للحذف الجماعي"
      />
      {isVideo ? (
        <video
          src={post.videoUrls[0]}
          className="w-14 h-14 rounded object-cover border shrink-0 bg-black"
          muted
        />
      ) : post.imageUrls[0] ? (
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

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          {/* شارة الحالة بنمط pill مطابق للإعلانات */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              failed
                ? "border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                : partial
                  ? "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500"
                  : post.status === "published"
                    ? "border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                    : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {failed ? (
              <AlertTriangle className="w-3 h-3" />
            ) : post.status === "published" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : null}
            {st.text}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {new Date(post.createdAt).toLocaleDateString("ar-IQ")}
          </span>
        </div>
        <p
          className="text-sm font-medium leading-snug line-clamp-2"
          title={post.caption || undefined}
        >
          {post.caption || "—"}
        </p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          {!post.productId && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500 px-1.5 py-0.5"
              title="منشور بلا منتج — إعلانه لن يُربط بصرف Meta تلقائياً"
            >
              <AlertTriangle className="w-3 h-3" /> بلا منتج
            </span>
          )}
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
        </div>
        {post.error && (
          <p className="text-xs text-red-600 line-clamp-2">{post.error}</p>
        )}
        {post.needsIgFinish && !post.error && (
          <p className="text-xs text-blue-600">
            فيديو إنستغرام يُعالَج على خوادم إنستغرام. انتظر دقيقة ثم اضغط «إنهاء
            إنستغرام» لإتمام النشر (كرّر إن قال «قيد المعالجة»).
          </p>
        )}
        {/* سطر الإعلان المُطلق — بنفس بنود بطاقة إعلان الفيديو (الميزانية + الحالة) */}
        {hasAnyLaunch && primaryLaunch && (
          <div className="pt-1.5 border-t flex items-center justify-between gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                primaryLaunch.status === "failed"
                  ? "border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                  : "border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
              }`}
              title={primaryLaunch.error ?? undefined}
            >
              {primaryLaunch.status === "failed" ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <Rocket className="w-3 h-3" />
              )}
              {fmtAdMoney(primaryLaunch.dailyBudget, primaryLaunch.currency)}/يوم ·{" "}
              {primaryLaunch.status === "failed" ? "فشل الإطلاق" : "أُنشئ موقوفاً"}
            </span>
            {moreLaunches > 0 && (
              <span className="text-[11px] text-muted-foreground">
                +{moreLaunches} إعلان آخر
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 shrink-0">
        {post.needsIgFinish && (
          <Button
            size="sm"
            variant="outline"
            onClick={onFinishIg}
            disabled={pending}
            title="أكمل نشر فيديو إنستغرام بعد انتهاء المعالجة"
          >
            <Instagram className="w-3.5 h-3.5 ml-1" /> إنهاء إنستغرام
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!canLaunch || !post.fbPostId || isVideo || pending}
          onClick={onBoost}
          title={
            isVideo
              ? "تعزيز منشورات الفيديو غير مدعوم بعد"
              : !post.fbPostId
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

  const budgetNum = Number(budget) || 0;

  const onLaunch = () =>
    startTransition(async () => {
      const r = await launchAd({
        postId,
        objective: objective as never,
        dailyBudget: budgetNum,
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
          {budgetNum > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              الميزانية اليومية: {fmtAdMoney(budgetNum)}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="flex items-center gap-1 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" /> يُنشأ الإعلان موقوفاً
          </p>
          <p>
            لن يُصرف أي مبلغ تلقائياً. راجع الإعلان في مدير إعلانات Meta وتأكّد من
            الميزانية والعملة ومدّة التشغيل، ثم فعّله من هناك. تبدأ مدّة التشغيل
            من وقت التفعيل في مدير الإعلانات.
          </p>
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
