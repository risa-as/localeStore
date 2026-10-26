"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())} className="inline-flex items-center justify-center gap-2 rounded-[10px] border bg-background px-3 py-2 text-xs font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
    <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
    {pending ? "جارٍ التحديث…" : "تحديث البيانات"}
  </button>;
}
