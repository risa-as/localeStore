import { prisma } from "@/db/prisma";

/**
 * وحدة واتساب المركزية — كل بيانات الحساب تأتي من متغيرات البيئة
 * حتى يستطيع كل مستخدم للنظام (نشر Vercel مستقل) وضع رقمه وتوكنه الخاص:
 *
 *   WHATSAPP_TOKEN            التوكن الدائم (System User Token)
 *   WHATSAPP_PHONE_NUMBER_ID  معرف رقم الهاتف في Meta (Phone Number ID)
 *   WHATSAPP_VERIFY_TOKEN     كلمة سرية من اختيارك للتحقق من Webhook
 *   WHATSAPP_APP_SECRET       App Secret للتحقق من توقيع Meta (اختياري لكنه مُوصى به)
 */

const GRAPH_VERSION = "v25.0";

export type WaConfig = {
  token: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret?: string;
};

export function getWaConfig(): WaConfig | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET,
  };
}

// 07XXXXXXXXX ← → 9647XXXXXXXX
export function toWaPhone(local: string): string {
  const trimmed = (local || "").replace(/\s+/g, "");
  if (trimmed.startsWith("964")) return trimmed;
  return "964" + trimmed.substring(1);
}

export function toLocalPhone(wa: string): string {
  const trimmed = (wa || "").replace(/\s+/g, "");
  if (trimmed.startsWith("964")) return "0" + trimmed.slice(3);
  return trimmed;
}

async function graphPost(config: WaConfig, body: unknown) {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `WhatsApp API ${res.status}: ${JSON.stringify(data?.error ?? data)}`,
    );
  }
  return data as { messages?: { id: string }[] };
}

/** حفظ رسالة صادرة في سجل المحادثة (حتى تظهر القوالب والردود في صفحة المحادثات) */
async function recordOutbound(params: {
  localPhone: string;
  waMessageId?: string;
  type: string;
  body: string;
}) {
  try {
    const conversation = await prisma.waConversation.upsert({
      where: { phone: params.localPhone },
      create: {
        phone: params.localPhone,
        lastMessageAt: new Date(),
        lastMessagePreview: params.body,
      },
      update: {
        lastMessageAt: new Date(),
        lastMessagePreview: params.body,
      },
    });
    await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        waMessageId: params.waMessageId,
        direction: "out",
        type: params.type,
        body: params.body,
        status: "sent",
      },
    });
  } catch (err) {
    // فشل التسجيل المحلي يجب ألا يفشل الإرسال نفسه
    console.error("❌ WhatsApp recordOutbound error:", err);
  }
}

/** إرسال قالب تأكيد الطلب — يطابق سلوك n8n السابق (خصم 5 عند الكمية > 1) */
export async function sendOrderConfirmation(params: {
  fullName: string;
  phoneNumber: string; // بصيغة محلية 07XXXXXXXXX
  product: string;
  quantity: number;
  price: number;
}) {
  const config = getWaConfig();
  if (!config) return;

  const newprice =
    params.quantity > 1 ? params.price - 5 : params.price;

  const data = await graphPost(config, {
    messaging_product: "whatsapp",
    to: toWaPhone(params.phoneNumber),
    type: "template",
    template: {
      name: "order_confirmation_utility",
      language: { code: "ar" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.fullName || "" },
            { type: "text", text: params.product || "" },
            { type: "text", text: params.quantity?.toString() || "1" },
            { type: "text", text: newprice?.toString() || "0" },
          ],
        },
      ],
    },
  });

  await recordOutbound({
    localPhone: toLocalPhone(toWaPhone(params.phoneNumber)),
    waMessageId: data.messages?.[0]?.id,
    type: "template",
    body: `📦 قالب تأكيد الطلب — ${params.product} × ${params.quantity} بسعر ${newprice}`,
  });
}

/** إرسال قالب الطلب الراجع — يطابق سلوك n8n السابق */
export async function sendOrderReturned(params: {
  fullName: string;
  phoneNumber: string; // بصيغة محلية 07XXXXXXXXX
  product: string;
  price: string;
}) {
  const config = getWaConfig();
  if (!config) return;

  const data = await graphPost(config, {
    messaging_product: "whatsapp",
    to: toWaPhone(params.phoneNumber),
    type: "template",
    template: {
      name: "order_returned",
      language: { code: "ar" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.fullName || "" },
            { type: "text", text: params.product || "" },
            { type: "text", text: params.price || "0" },
          ],
        },
      ],
    },
  });

  await recordOutbound({
    localPhone: toLocalPhone(toWaPhone(params.phoneNumber)),
    waMessageId: data.messages?.[0]?.id,
    type: "template",
    body: `↩️ قالب الطلب الراجع — ${params.product}`,
  });
}

/**
 * رفع ملف إلى Meta وإرجاع معرّف الوسائط.
 *
 * نرفع الملف مباشرة إلى Meta بدلاً من استضافته على رابط عام، حتى لا تتسرّب صور
 * المحادثات إلى الإنترنت. المعرّف الناتج يعمل أيضاً مع /api/whatsapp/media/[id]
 * فتظهر الصورة المرسَلة في سجل المحادثة كما تظهر صور الزبون.
 */
export async function uploadWaMedia(file: File): Promise<string> {
  const config = getWaConfig();
  if (!config) throw new Error("WhatsApp غير مُهيأ — أضف متغيرات البيئة");

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", file.type);
  form.append("file", file, file.name || "upload");

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body: form,
    },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    throw new Error(
      `WhatsApp media upload ${res.status}: ${JSON.stringify(data?.error ?? data)}`,
    );
  }
  return data.id as string;
}

/** إرسال صورة (ضمن نافذة الـ 24 ساعة) — يعيد معرف الرسالة لدى Meta */
export async function sendWaImage(params: {
  phoneNumber: string;
  mediaId: string;
  caption?: string;
}): Promise<string | undefined> {
  const config = getWaConfig();
  if (!config) throw new Error("WhatsApp غير مُهيأ — أضف متغيرات البيئة");

  const data = await graphPost(config, {
    messaging_product: "whatsapp",
    to: toWaPhone(params.phoneNumber),
    type: "image",
    image: {
      id: params.mediaId,
      ...(params.caption ? { caption: params.caption } : {}),
    },
  });
  return data.messages?.[0]?.id;
}

/** إرسال رد نصي حر (ضمن نافذة الـ 24 ساعة) — يعيد معرف الرسالة لدى Meta */
export async function sendWaText(params: {
  phoneNumber: string; // محلية أو دولية
  body: string;
}): Promise<string | undefined> {
  const config = getWaConfig();
  if (!config) throw new Error("WhatsApp غير مُهيأ — أضف متغيرات البيئة");

  const data = await graphPost(config, {
    messaging_product: "whatsapp",
    to: toWaPhone(params.phoneNumber),
    type: "text",
    text: { body: params.body },
  });
  return data.messages?.[0]?.id;
}
