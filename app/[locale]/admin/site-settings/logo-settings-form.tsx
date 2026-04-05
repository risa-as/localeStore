"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateLogoUrl } from "@/lib/actions/site-settings.actions";
import { useToast } from "@/hooks/use-toast";
import { UploadButton } from "@/lib/uploadthing";
import Image from "next/image";
import { Loader2, CheckCircle2, Upload } from "lucide-react";

export default function LogoSettingsForm({
  currentLogoUrl,
}: {
  currentLogoUrl: string;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl);
  const [uploading, setUploading] = useState(false);

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateLogoUrl(logoUrl);
      toast({
        variant: res.success ? "default" : "destructive",
        title: res.success ? "تم الحفظ" : "خطأ",
        description: res.message,
      });
    });
  };

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-6 space-y-6">

        {/* Current logo preview */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">اللوغو الحالي</p>
          <div className="flex items-center justify-center p-8 rounded-xl border-2 border-dashed bg-muted/30">
            <Image
              key={logoUrl}
              src={logoUrl}
              alt="Logo"
              width={120}
              height={120}
              className="object-contain rounded-xl max-h-28 w-auto"
            />
          </div>
        </div>

        {/* Upload new logo */}
        <div className="space-y-2">
          <p className="text-sm font-medium">رفع لوغو جديد</p>
          <div className="upload-field flex items-center justify-center p-4 rounded-xl border-2 border-dashed hover:border-primary/50 transition-colors">
            {uploading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">جاري الرفع...</span>
              </div>
            ) : (
              <UploadButton
                endpoint="imageUploader"
                onUploadBegin={() => setUploading(true)}
                onClientUploadComplete={(res) => {
                  setUploading(false);
                  if (res?.[0]?.ufsUrl || res?.[0]?.url) {
                    setLogoUrl(res[0].ufsUrl ?? res[0].url);
                    toast({
                      description: "تم رفع الصورة، اضغط حفظ لتطبيق التغيير",
                    });
                  }
                }}
                onUploadError={() => {
                  setUploading(false);
                  toast({
                    variant: "destructive",
                    description: "فشل رفع الصورة",
                  });
                }}
                appearance={{
                  button: "ut-ready:bg-primary ut-uploading:bg-primary/70 text-primary-foreground font-semibold rounded-xl px-6",
                  allowedContent: "hidden",
                }}
                content={{
                  button: (
                    <span className="flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      اختر صورة
                    </span>
                  ),
                }}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            PNG, JPG, SVG — حجم أقصى 16MB
          </p>
        </div>

        {/* Saved indicator */}
        {logoUrl !== currentLogoUrl && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            تم اختيار لوغو جديد — اضغط حفظ لتطبيقه
          </div>
        )}
      </div>

      <div className="border-t bg-muted/30 px-6 py-4">
        <Button
          onClick={handleSave}
          disabled={isPending || uploading || logoUrl === currentLogoUrl}
          className="w-full"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          حفظ اللوغو
        </Button>
      </div>
    </div>
  );
}
