"use server";

import { prisma } from "@/db/prisma";
import { requireStaff as requireCurrentStaff } from "@/lib/authorization";
import {
  sendWaText,
  sendWaImage,
  uploadWaMedia,
  getWaConfig,
  WA_TEMPLATE_BODY_PREFIX,
  type WaTemplateKind,
} from "@/lib/whatsapp";
import type { Prisma } from "@prisma/client";
import { waConversationFilter, waConversationStatusWhere } from "@/lib/whatsapp-inbox-filters";

async function requireStaff() {
  return requireCurrentStaff();
}

export async function isWhatsAppConfigured() {
  await requireStaff();
  return getWaConfig() !== null;
}

function isTemplateKind(value: unknown): value is WaTemplateKind {
  return value === "confirmation" || value === "returned";
}

/** شرط البحث بالاسم/الرقم + (اختيارياً) محادثات أُرسل لها قالب معيّن */
function conversationWhere(
  query?: string,
  template?: WaTemplateKind,
): Prisma.WaConversationWhereInput {
  const and: Prisma.WaConversationWhereInput[] = [];
  if (query) {
    and.push({
      OR: [
        { phone: { contains: query } },
        { customerName: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (template) {
    and.push({
      messages: {
        some: {
          direction: "out",
          type: "template",
          body: { startsWith: WA_TEMPLATE_BODY_PREFIX[template] },
        },
      },
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

/**
 * قائمة المحادثات مع بحث بالاسم أو الرقم.
 * فلاتر الحالة والقالب تُطبَّق في قاعدة البيانات قبل حد الـ 100.
 */
export async function getWaConversations(query?: string, template?: string, filter?: string) {
  await requireStaff();
  return findWaConversations({
    ...conversationWhere(query, isTemplateKind(template) ? template : undefined),
    ...waConversationStatusWhere(waConversationFilter(filter), new Date()),
  });
}

async function findWaConversations(where: Prisma.WaConversationWhereInput) {
  const conversations = await prisma.waConversation.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  return conversations.map((c) => ({
    id: c.id,
    phone: c.phone,
    customerName: c.customerName,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessagePreview: c.lastMessagePreview,
    unreadCount: c.unreadCount,
    windowExpiresAt: c.windowExpiresAt?.toISOString() ?? null,
  }));
}

/** Counts cover every matching conversation; the list contains the latest 100 matches. */
export async function getWaInbox(query?: string, template?: string, filter?: string) {
  await requireStaff();
  const selectedQuery = typeof query === "string" ? query.trim() : "";
  const selectedTemplate = isTemplateKind(template) ? template : undefined;
  const selectedFilter = waConversationFilter(filter);
  const now = new Date();
  const base = conversationWhere(selectedQuery, selectedTemplate);
  const [conversations, all, unread, open, confirmation, returned] = await Promise.all([
    findWaConversations({ ...base, ...waConversationStatusWhere(selectedFilter, now) }),
    prisma.waConversation.count({ where: base }),
    prisma.waConversation.count({ where: { ...base, ...waConversationStatusWhere("unread", now) } }),
    prisma.waConversation.count({ where: { ...base, ...waConversationStatusWhere("open", now) } }),
    prisma.waConversation.count({ where: conversationWhere(selectedQuery, "confirmation") }),
    prisma.waConversation.count({ where: conversationWhere(selectedQuery, "returned") }),
  ]);
  return {
    conversations,
    counts: { all, unread, open, closed: Math.max(0, all - open) },
    templateCounts: { confirmation, returned },
    selection: { query: selectedQuery, template: selectedTemplate ?? ("all" as const), filter: selectedFilter },
  };
}

/** عدد المحادثات التي أُرسل لها كل قالب (ضمن نتيجة البحث الحالية) */
export async function getWaTemplateCounts(query?: string) {
  await requireStaff();

  const [confirmation, returned] = await Promise.all([
    prisma.waConversation.count({
      where: conversationWhere(query, "confirmation"),
    }),
    prisma.waConversation.count({
      where: conversationWhere(query, "returned"),
    }),
  ]);

  return { confirmation, returned };
}

/** رسائل محادثة + طلبات الزبون (بالرقم) — ويصفّر عداد غير المقروء */
export async function getWaThread(conversationId: string) {
  await requireStaff();

  const conversation = await prisma.waConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) return null;

  const [messages] = await Promise.all([
    prisma.waMessage.findMany({
      where: { conversationId },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 500,
    }),
    conversation.unreadCount > 0
      ? prisma.waConversation.update({
          where: { id: conversationId },
          data: { unreadCount: 0 },
        })
      : Promise.resolve(null),
  ]);

  // طلبات هذا الرقم — تُعرض داخل صفحة المحادثات فقط
  const orders = await prisma.order.findMany({
    where: { phoneNumber: conversation.phone },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      phoneNumber: true,
      isArchived: true,
      totalPrice: true,
      createdAt: true,
      orderitems: { select: { name: true, qty: true } },
    },
  });

  return {
    conversation: {
      id: conversation.id,
      phone: conversation.phone,
      customerName: conversation.customerName,
      windowExpiresAt: conversation.windowExpiresAt?.toISOString() ?? null,
    },
    messages: messages.reverse().map((m) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      body: m.body,
      mediaId: m.mediaId,
      status: m.status,
      errorCode: m.errorCode,
      timestamp: m.timestamp.toISOString(),
    })),
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      phoneNumber: o.phoneNumber,
      isArchived: o.isArchived,
      totalPrice: Number(o.totalPrice),
      createdAt: o.createdAt.toISOString(),
      items: o.orderitems.map((i) => `${i.name} × ${i.qty}`).join(" + "),
    })),
  };
}

/** إرسال رد حر — مسموح فقط ضمن نافذة الـ 24 ساعة */
export async function sendWaReply(conversationId: string, text: string) {
  await requireStaff();

  const body = text.trim();
  if (!body) return { success: false, message: "الرسالة فارغة" };

  const conversation = await prisma.waConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) return { success: false, message: "المحادثة غير موجودة" };

  if (
    !conversation.windowExpiresAt ||
    conversation.windowExpiresAt < new Date()
  ) {
    return {
      success: false,
      message:
        "انتهت نافذة الـ 24 ساعة — لا يمكن إرسال رد حر حتى يراسلك الزبون مجدداً",
    };
  }

  try {
    const waMessageId = await sendWaText({
      phoneNumber: conversation.phone,
      body,
    });

    await prisma.$transaction([
      prisma.waMessage.create({
        data: {
          conversationId,
          waMessageId,
          direction: "out",
          type: "text",
          body,
          status: "sent",
        },
      }),
      prisma.waConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: body.slice(0, 120),
        },
      }),
    ]);

    return { success: true, message: "تم الإرسال" };
  } catch (err) {
    console.error("❌ sendWaReply error:", err);
    return { success: false, message: "فشل الإرسال — تحقق من إعدادات واتساب" };
  }
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // حد Meta للصور
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** إرسال صورة — مسموح فقط ضمن نافذة الـ 24 ساعة */
export async function sendWaImageReply(formData: FormData) {
  await requireStaff();

  const conversationId = String(formData.get("conversationId") ?? "");
  const caption = String(formData.get("caption") ?? "").trim();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: "لم يتم اختيار صورة" };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { success: false, message: "صيغة غير مدعومة — استخدم JPG أو PNG أو WEBP" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { success: false, message: "حجم الصورة أكبر من 5 ميغابايت" };
  }

  const conversation = await prisma.waConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) return { success: false, message: "المحادثة غير موجودة" };

  if (
    !conversation.windowExpiresAt ||
    conversation.windowExpiresAt < new Date()
  ) {
    return {
      success: false,
      message:
        "انتهت نافذة الـ 24 ساعة — لا يمكن إرسال صورة حتى يراسلك الزبون مجدداً",
    };
  }

  try {
    // نرفع أولاً ثم نرسل: الفشل في الرفع يجب ألا يترك رسالة معلّقة في السجل.
    const mediaId = await uploadWaMedia(file);
    const waMessageId = await sendWaImage({
      phoneNumber: conversation.phone,
      mediaId,
      caption: caption || undefined,
    });

    await prisma.$transaction([
      prisma.waMessage.create({
        data: {
          conversationId,
          waMessageId,
          direction: "out",
          type: "image",
          body: caption || null,
          mediaId,
          status: "sent",
        },
      }),
      prisma.waConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: caption ? caption.slice(0, 120) : "📷 صورة",
        },
      }),
    ]);

    return { success: true, message: "تم إرسال الصورة" };
  } catch (err) {
    console.error("❌ sendWaImageReply error:", err);
    return { success: false, message: "فشل إرسال الصورة — تحقق من إعدادات واتساب" };
  }
}

/** عدد الرسائل غير المقروءة الكلي (لشارة القائمة الجانبية) */
export async function getWaUnreadCount() {
  await requireStaff();
  const result = await prisma.waConversation.aggregate({
    _sum: { unreadCount: true },
  });
  return result._sum.unreadCount ?? 0;
}
