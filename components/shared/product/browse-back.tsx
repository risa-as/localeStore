"use client";

import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";

export default function BrowseBack() {
  const router = useRouter();
  const locale = useLocale();
  const returnTo = useSearchParams().get("returnTo");
  return <Button variant="outline" className="mt-4 min-h-11 gap-2" onClick={() => {
    if (returnTo?.startsWith("/search?") || returnTo === "/search") router.push(returnTo);
    else if (window.history.length > 1 && document.referrer.startsWith(window.location.origin + "/")) router.back();
    else router.push("/search");
  }}><ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />{locale === "ar" ? "العودة إلى التصفح" : "Back to browsing"}</Button>;
}
