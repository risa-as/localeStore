"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** مدة العدّ قبل التحويل. */
export const REDIRECT_SECONDS = 5;

/**
 * عدّاد تحويل يبدأ بـ restart() ويعود إلى البداية مع كل استدعاء له، ويتوقف
 * مؤقتاً ما دام paused صحيحاً. عند الصفر ينتقل إلى href.
 */
export function useRedirectCountdown(href: string, { paused = false, disabled = false } = {}) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const restart = useCallback(() => {
    if (!disabled) setSecondsLeft(REDIRECT_SECONDS);
  }, [disabled]);
  useEffect(() => {
    if (secondsLeft === null || paused) return;
    if (secondsLeft <= 0) {
      router.push(href);
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, paused, router, href]);
  return { secondsLeft, restart };
}

export function RedirectCountdownBanner({ secondsLeft, busy }: { secondsLeft: number; busy?: boolean }) {
  const left = Math.max(0, secondsLeft);
  return (
    <div
      role="timer"
      aria-live="polite"
      dir="rtl"
      className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-right"
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" className="stroke-primary/15" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
            strokeDasharray={100.5}
            strokeDashoffset={100.5 * (1 - left / REDIRECT_SECONDS)}
          />
        </svg>
        <span className="text-sm font-bold tabular-nums text-primary">{left}</span>
      </span>
      <p className="flex-1 text-sm text-slate-700">
        {busy ? (
          "جارٍ إضافة المنتج إلى طلبك…"
        ) : (
          <>
            سيتم تحويلك لمتابعة التسوق خلال <strong className="tabular-nums">{left}</strong> ثوانٍ
          </>
        )}
      </p>
    </div>
  );
}
