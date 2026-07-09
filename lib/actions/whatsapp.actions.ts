"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import { sendWaText, getWaConfig } from "@/lib/whatsapp";

async function requireStaff() {
  const session = await auth();
  if (
    session?.user?.role !== "admin" &&
    session?.user?.role !== "employee"
  ) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function isWhatsAppConfigured() {
  await requireStaff();
  return getWaConfig() !== null;
}

/** قائمة المحادثات مع بحث بالاسم أو الرقم */
export async function getWaConversations(query?: string) {
  await requireStaff();

  const conversations = await prisma.waConversation.findMany({
    where: query
      ? {
          OR: [
            { phone: { contains: query } },
            { customerName: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { lastMessageAt: "desc" },
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
      orderBy: { timestamp: "asc" },
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
    messages: messages.map((m) => ({
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

/** عدد الرسائل غير المقروءة الكلي (لشارة القائمة الجانبية) */
export async function getWaUnreadCount() {
  await requireStaff();
  const result = await prisma.waConversation.aggregate({
    _sum: { unreadCount: true },
  });
  return result._sum.unreadCount ?? 0;
}
