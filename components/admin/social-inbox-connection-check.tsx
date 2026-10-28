"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { checkSocialInboxConnection } from "@/lib/actions/social-inbox.actions";
import type { SocialPlatform } from "@/lib/meta/inbox";
import type { InboxConnectionHealth } from "@/lib/meta/inbox-connection";

export default function SocialInboxConnectionCheck({ pageId, platform }: { pageId: string; platform: SocialPlatform }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InboxConnectionHealth | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  async function check() {
    if (busy) return;
    const sequence = ++request.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await checkSocialInboxConnection({ pageId, platform });
      if (request.current !== sequence) return;
      if (response.ok) setResult(response.data);
      else setError(response.message);
    } catch {
      if (request.current === sequence) setError("تعذر إكمال الفحص؛ حاول مرة أخرى.");
    } finally { if (request.current === sequence) setBusy(false); }
  }
  return <div className="space-y-2">
    <Button size="sm" variant="outline" className="w-full rounded-[10px]" disabled={busy} onClick={() => void check()}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}فحص اتصال المراسلة
    </Button>
    {(result || error) && <div role="status" className="rounded-[10px] border p-2 text-xs leading-5 space-y-1">
      <p>{error || result?.message}</p>
      {!!result?.issues.length && <ul className="list-disc ps-4">{result.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {result && <p className="text-muted-foreground">وقت الفحص: {new Date(result.checkedAt).toLocaleString("ar-IQ")}</p>}
    </div>}
  </div>;
}
