import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/db/prisma";
import { getWaConfig, toLocalPhone } from "@/lib/whatsapp";

/**
 * Webhook واتساب — يوجَّه إليه Callback URL في تطبيق Meta:
 *   https://<your-domain>/api/whatsapp/webhook
 * مع الاشتراك في حقل "messages" (يشمل الرسائل الواردة وحالات التسليم معاً).
 *
 * يحل محل وورك فلو n8n "whatsapp-status" بالكامل:
 *   فشل التسليم → سجل في WhatsAppFailedDelivery، والنجاح → حذف سجلات الرقم.
 */

// تحقق Meta الأولي من الرابط
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const config = getWaConfig();
  if (mode === "subscribe" && config && token === config.verifyToken) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function verifySignature(appSecret: string, rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const received = header.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex"),
    );
  } catch {
    return false;
  }
}

type WaInboundMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string };
  video?: { id: string; caption?: string };
  audio?: { id: string };
  document?: { id: string; filename?: string; caption?: string };
  sticker?: { id: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: {
    name?: { formatted_name?: string };
    phones?: { phone?: string }[];
  }[];
  reaction?: { emoji?: string; message_id?: string };
  order?: { catalog_id?: string; product_items?: unknown[] };
  system?: { body?: string };
  errors?: { code: number; title?: string; message?: string }[];
};

type WaStatus = {
  id: string;
  recipient_id: string;
  status: string; // sent | delivered | read | failed
  errors?: { code: number; message?: string }[];
};

const SUPPORTED_MEDIA = ["image", "video", "audio", "document", "sticker"] as const;

type Extracted = {
  type: string;
  body: string | null;
  mediaId: string | null;
  /** Short label for the conversation list — never the raw JSON of a payload. */
  preview: string;
};

function extractBody(msg: WaInboundMessage): Extracted {
  if (msg.type === "text") {
    const body = msg.text?.body ?? "";
    return { type: "text", body, mediaId: null, preview: body.slice(0, 120) };
  }
  if (msg.type === "button") {
    const body = msg.button?.text ?? "";
    return { type: "text", body, mediaId: null, preview: body.slice(0, 120) };
  }
  if (msg.type === "interactive") {
    const body =
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      "";
    return { type: "text", body, mediaId: null, preview: body.slice(0, 120) };
  }
  if ((SUPPORTED_MEDIA as readonly string[]).includes(msg.type)) {
    const media = msg[msg.type as (typeof SUPPORTED_MEDIA)[number]];
    const caption = (media as { caption?: string })?.caption ?? null;
    const labels: Record<string, string> = {
      image: "📷 صورة",
      video: "🎬 فيديو",
      audio: "🎤 رسالة صوتية",
      document: "📄 ملف",
      sticker: "🩵 ملصق",
    };
    return {
      type: msg.type,
      body: caption,
      mediaId: media?.id ?? null,
      preview: caption ? caption.slice(0, 120) : (labels[msg.type] ?? "مرفق"),
    };
  }

  // ── Types that used to fall through to "unsupported" ────────────────────
  // Customers share their location for delivery and react to messages with
  // emoji constantly, so these were by far the most common cause of the
  // "رسالة غير مدعومة" placeholder.

  if (msg.type === "location" && msg.location) {
    const { latitude, longitude, name, address } = msg.location;
    // Stored as JSON so the UI can render a real map link; `preview` keeps the
    // conversation list readable.
    return {
      type: "location",
      body: JSON.stringify({ latitude, longitude, name, address }),
      mediaId: null,
      preview: `📍 ${name || address || "موقع"}`.slice(0, 120),
    };
  }

  if (msg.type === "contacts" && msg.contacts?.length) {
    const names = msg.contacts
      .map(
        (c) => c.name?.formatted_name || c.phones?.[0]?.phone || "جهة اتصال",
      )
      .join("، ");
    return {
      type: "contacts",
      body: names,
      mediaId: null,
      preview: `👤 ${names}`.slice(0, 120),
    };
  }

  if (msg.type === "reaction" && msg.reaction) {
    const emoji = msg.reaction.emoji ?? "";
    // An empty emoji means the customer REMOVED their reaction.
    return {
      type: "reaction",
      body: emoji,
      mediaId: null,
      preview: emoji ? `${emoji} تفاعل` : "أزال التفاعل",
    };
  }

  if (msg.type === "order" && msg.order) {
    const count = msg.order.product_items?.length ?? 0;
    return {
      type: "order",
      body: `طلب من الكتالوج — ${count} صنف`,
      mediaId: null,
      preview: `🛒 طلب من الكتالوج (${count} صنف)`,
    };
  }

  if (msg.type === "system") {
    const body = msg.system?.body ?? "تحديث من واتساب";
    return { type: "system", body, mediaId: null, preview: `ℹ️ ${body}`.slice(0, 120) };
  }

  // Genuinely unknown to us — keep the raw type so it can be diagnosed instead
  // of silently collapsing to an opaque placeholder.
  const detail = msg.errors?.[0]?.title || msg.type || "غير معروف";
  return {
    type: "unsupported",
    body: detail,
    mediaId: null,
    preview: `رسالة غير مدعومة (${detail})`.slice(0, 120),
  };
}

async function handleInboundMessage(
  msg: WaInboundMessage,
  contactName: string | undefined,
) {
  const localPhone = toLocalPhone(msg.from);
  const { type, body, mediaId, preview } = extractBody(msg);
  const sentAt = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000)
    : new Date();
  const windowExpiresAt = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000);

  const conversation = await prisma.waConversation.upsert({
    where: { phone: localPhone },
    create: {
      phone: localPhone,
      customerName: contactName,
      lastMessageAt: sentAt,
      lastMessagePreview: preview,
      unreadCount: 1,
      windowExpiresAt,
    },
    update: {
      ...(contactName ? { customerName: contactName } : {}),
      lastMessageAt: sentAt,
      lastMessagePreview: preview,
      unreadCount: { increment: 1 },
      windowExpiresAt,
    },
  });

  // waMessageId فريد — إعادة إرسال Meta لنفس الحدث لن تُنشئ تكراراً
  await prisma.waMessage
    .create({
      data: {
        conversationId: conversation.id,
        waMessageId: msg.id,
        direction: "in",
        type,
        body,
        mediaId,
        status: "delivered",
        timestamp: sentAt,
      },
    })
    .catch((err: { code?: string }) => {
      if (err?.code !== "P2002") throw err; // P2002 = رسالة مكررة، نتجاهلها
    });
}

// ترتيب تصاعدي للحالات حتى لا تتراجع "قُرئت" إلى "وصلت" عند تأخر الأحداث
const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

async function handleStatus(status: WaStatus) {
  const localPhone = toLocalPhone(status.recipient_id);
  const errorCode = status.errors?.[0]?.code?.toString() ?? null;

  const existing = await prisma.waMessage.findUnique({
    where: { waMessageId: status.id },
    select: { id: true, status: true },
  });
  if (existing) {
    const newRank = STATUS_RANK[status.status] ?? 0;
    const oldRank = STATUS_RANK[existing.status] ?? 0;
    if (newRank > oldRank) {
      await prisma.waMessage.update({
        where: { id: existing.id },
        data: { status: status.status, errorCode },
      });
    }
  }

  // سلوك n8n السابق كما هو: الفشل يسجَّل والنجاح يمسح سجلات الرقم
  if (status.status === "failed") {
    await prisma.whatsAppFailedDelivery.create({
      data: {
        phone: localPhone,
        status: status.status,
        messageId: status.id,
        errorCode,
      },
    });
  } else {
    await prisma.whatsAppFailedDelivery.deleteMany({
      where: { phone: localPhone },
    });
  }
}

export async function POST(req: Request) {
  const config = getWaConfig();
  const rawBody = await req.text();

  if (config?.appSecret) {
    const ok = verifySignature(
      config.appSecret,
      rawBody,
      req.headers.get("x-hub-signature-256"),
    );
    if (!ok) return new Response("Invalid signature", { status: 401 });
  }

  let payload: {
    entry?: {
      changes?: {
        value?: {
          messages?: WaInboundMessage[];
          statuses?: WaStatus[];
          contacts?: { wa_id: string; profile?: { name?: string } }[];
        };
      }[];
    }[];
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        for (const msg of value.messages ?? []) {
          const contactName = value.contacts?.find(
            (c) => c.wa_id === msg.from,
          )?.profile?.name;
          await handleInboundMessage(msg, contactName);
        }
        for (const status of value.statuses ?? []) {
          await handleStatus(status);
        }
      }
    }
  } catch (err) {
    // نرجع 200 دائماً حتى لا تعيد Meta الإرسال بلا نهاية — الخطأ يُسجَّل فقط
    console.error("❌ WhatsApp webhook error:", err);
  }

  return NextResponse.json({ success: true });
}
