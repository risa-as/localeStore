import { auth } from "@/auth";
import { getWaConfig } from "@/lib/whatsapp";

/**
 * وسيط لجلب وسائط واتساب (صور/صوت/ملفات الزبائن):
 * Meta لا تعطي روابط مباشرة — المعرف يتحول لرابط مؤقت يتطلب التوكن،
 * لذا نجلبه من السيرفر ونمرره للأدمن فقط.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (
    session?.user?.role !== "admin" &&
    session?.user?.role !== "employee"
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const config = getWaConfig();
  if (!config) return new Response("WhatsApp not configured", { status: 503 });

  const { id } = await params;

  // الخطوة 1: معرف الوسائط → رابط تنزيل مؤقت
  const metaRes = await fetch(`https://graph.facebook.com/v25.0/${id}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!metaRes.ok) return new Response("Media not found", { status: 404 });
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return new Response("Media not found", { status: 404 });

  // الخطوة 2: تنزيل المحتوى بالتوكن وتمريره
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!fileRes.ok) return new Response("Media fetch failed", { status: 502 });

  return new Response(fileRes.body, {
    status: 200,
    headers: {
      "Content-Type": meta.mime_type ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
