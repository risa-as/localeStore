"use client";

import { useEffect, useState, type RefObject } from "react";
import { Phone, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectedOrderValue } from "@/lib/meta/inbox-workflow";

export default function SocialInboxSelection({ container, disabled, onApply }: {
  container: RefObject<HTMLDivElement | null>; disabled: boolean;
  onApply: (field: "phoneNumber" | "address", value: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const capture = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) { setText(""); return; }
      const range = selection.getRangeAt(0);
      const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
      const source = start?.closest("[data-inbox-customer-text]");
      if (!source || !container.current?.contains(source) || !source.contains(range.endContainer)) { setText(""); return; }
      setText(selection.toString().trim()); setError("");
    };
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, [container]);
  function apply(field: "phoneNumber" | "address") {
    try {
      onApply(field, selectedOrderValue(field, text));
      setText(""); setError(""); window.getSelection()?.removeAllRanges();
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر استخدام النص المحدد"); }
  }
  if (!text) return null;
  return <div role="region" aria-label="استخدام النص المحدد للحجز" className="rounded-lg border bg-muted/30 p-2 space-y-1.5">
    <div className="flex items-center gap-2"><span dir="auto" className="text-xs truncate flex-1">{text}</span><Button size="icon" variant="ghost" className="size-6" aria-label="إلغاء تحديد بيانات الحجز" onPointerDown={e => e.preventDefault()} onClick={() => { setText(""); window.getSelection()?.removeAllRanges(); }}><X className="size-3" /></Button></div>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={disabled} onPointerDown={e => e.preventDefault()} onClick={() => apply("phoneNumber")}><Phone className="size-3" />استخدم كهاتف</Button><Button type="button" size="sm" variant="outline" disabled={disabled} onPointerDown={e => e.preventDefault()} onClick={() => apply("address")}><MapPin className="size-3" />استخدم كعنوان</Button><span className="text-[11px] text-muted-foreground self-center">يُضاف إلى مسودة الحجز لهذه المحادثة</span></div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
