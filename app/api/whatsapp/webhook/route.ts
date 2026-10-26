import { NextResponse } from "next/server";
import crypto from "crypto";
import { advanceWaStatus } from "@/lib/whatsapp-status";
import { RETURN_INQUIRY_STATUSES } from "@/lib/orders/return-inquiry";
import { prisma } from "@/db/prisma";
import { getWaConfig, toLocalPhone } from "@/lib/whatsapp";
import {
  resolveInboundOwnership,
  ownsStatusUpdate,
} from "@/lib/whatsapp-tenant";

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
  context?: { id?: string };
  button?: { text: string; payload?: string };
  interactive?: { button_reply?: { title: string; id?: string }; list_reply?: { title: string; id?: string } };
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
  /** يصل مع أول رسالة من إعلان «انقر للمراسلة» — يحمل رابط الإعلان */
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    ctwa_clid?: string;
  };
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

  // نسجّل رابط الإعلان عند وصوله حتى يمكن ضبط WHATSAPP_OWN/FOREIGN_DOMAINS عليه
  if (msg.referral?.source_url) {
    console.log(`📣 رسالة من إعلان — ${localPhone} ← ${msg.referral.source_url}`);
  }

  // متاجر تتشارك نفس رقم واتساب تستقبل نفس الأحداث — نخزّن زبائننا فقط
  const ownership = await resolveInboundOwnership({
    localPhone,
    referralSourceUrl: msg.referral?.source_url,
  });
  if (!ownership.owned) {
    console.log(
      `⏭️ تجاهل رسالة واردة من ${localPhone} — ${ownership.reason === "foreign-ad" ? "إعلان متجر آخر" : "ليست من زبائن هذا المتجر"}`,
    );
    return;
  }

  const { type, body, mediaId, preview } = extractBody(msg);
  const sentAt = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000)
    : new Date();
  const windowExpiresAt = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000);

  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${msg.id}))`;
    if (await tx.waMessage.findUnique({ where: { waMessageId: msg.id }, select: { id: true } })) return;
    let reply = msg.context?.id ? await tx.waMessage.findFirst({ where: { waMessageId: msg.context.id, direction: "out", conversation: { phone: localPhone } }, select: { orderId: true } }) : null;
    if (!msg.context?.id) {
      const candidates = await tx.messageOutbox.findMany({ where: { template: "order_returned", status: { in: ["accepted", "sent", "delivered", "read"] }, createdAt: { gte: new Date(sentAt.getTime() - 48 * 3600000), lte: sentAt }, order: { phoneNumber: localPhone, status: { in: RETURN_INQUIRY_STATUSES } } }, select: { orderId: true }, take: 2 });
      if (candidates.length === 1) reply = { orderId: candidates[0].orderId };
    }
  const conversation = await tx.waConversation.upsert({
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
  await tx.waMessage
    .create({
      data: {
        conversationId: conversation.id,
        waMessageId: msg.id,
        orderId: reply?.orderId,
        replyToMessageId: msg.context?.id,
        buttonPayload: msg.button?.payload ?? msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,
        direction: "in",
        type,
        body,
        mediaId,
        status: "delivered",
        timestamp: sentAt,
      },
    })
;
    if (reply?.orderId && body) await tx.order.updateMany({ where: { id: reply.orderId, status: { in: RETURN_INQUIRY_STATUSES } }, data: { returnReasonText: body } });
  });
}

// ترتيب تصاعدي للحالات حتى لا تتراجع "قُرئت" إلى "وصلت" عند تأخر الأحداث
const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 1,
};

async function handleStatus(status: WaStatus) {
  const localPhone = toLocalPhone(status.recipient_id);
  const errorCode = status.errors?.[0]?.code?.toString() ?? null;

  const existing = await prisma.waMessage.findUnique({
    where: { waMessageId: status.id },
    select: { id: true, status: true },
  });

  // حالة تسليم لرسالة أرسلها متجر آخر يتشارك نفس الرقم — لا تخصّنا
  const owned = await ownsStatusUpdate({
    messageExists: Boolean(existing),
    localPhone,
  });
  if (!owned) return;

  if (existing) {
    const newRank = STATUS_RANK[status.status] ?? 0;
    const oldRank = STATUS_RANK[existing.status] ?? 0;
    if (newRank > oldRank || (status.status === "failed" && oldRank < 2)) {
      await prisma.waMessage.updateMany({
        where: { id: existing.id, status: existing.status },
        data: { status: status.status, errorCode },
      });
    }
  }

  const outbox = await prisma.messageOutbox.findUnique({ where: { waMessageId: status.id } });
  if (outbox) {
    const next = advanceWaStatus(outbox.status, status.status);
    await prisma.messageOutbox.updateMany({ where: { id: outbox.id, status: outbox.status }, data: { status: next, ...(next === status.status ? { lastError: errorCode } : {}) } });
  }
  // Keep failures scoped to the same message; unrelated successes must not hide them.
  if (status.status === "failed" && (!existing || advanceWaStatus(existing.status, "failed") === "failed")) {
    const duplicate = await prisma.whatsAppFailedDelivery.findFirst({ where: { messageId: status.id } });
    if (!duplicate) await prisma.whatsAppFailedDelivery.create({
      data: {
        phone: localPhone,
        status: status.status,
        messageId: status.id,
        errorCode,
      },
    });
  } else if (["delivered", "read"].includes(status.status)) {
    await prisma.whatsAppFailedDelivery.deleteMany({
      where: { messageId: status.id },
    });
  }
}

export async function POST(req: Request) {
  const config = getWaConfig();
  const rawBody = await req.text();

  if (!config?.appSecret) return new Response("Webhook secret is not configured", { status: 503 });
  if (config.appSecret) {
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
    return NextResponse.json({ success: false }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
