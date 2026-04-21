"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ModonSyncButton() {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleSync = async () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/modon/sync");
        const data = await res.json();
        if (data.success) {
          toast({
            title: "تمت المزامنة بنجاح",
            description: data.message,
          });
        } else {
          toast({
            variant: "destructive",
            title: "فشل",
            description: data.error || data.message || "حدث خطأ غير معروف",
          });
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: "غير قادر على الاتصال بسيرفر المزامنة",
        });
      }
    });
  };

  return (
    <Button
      variant="outline"
      className="gap-2 border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
      onClick={handleSync}
      disabled={isPending}
    >
      <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`} />
      تحديث مدن
    </Button>
  );
}
