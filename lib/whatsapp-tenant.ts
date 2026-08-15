import { prisma } from "@/db/prisma";
import { toWaPhone } from "@/lib/whatsapp";

/**
 * فصل المحادثات بين المتاجر التي تتشارك نفس رقم واتساب.
 *
 * عندما يشترك نشران مختلفان (دومين وقاعدة بيانات لكل واحد) في نفس
 * WHATSAPP_PHONE_NUMBER_ID، فإن Meta ترسل نفس أحداث الويبهوك إلى الاثنين،
 * فتُخزَّن رسائل زبائن الطرفين في كلتا القاعدتين وتظهر في /admin/chats.
 * هذه الوحدة تقرر: هل هذه الرسالة تخص زبائن هذا المتجر أم لا؟
 *
 * متغيرات البيئة:
 *   WHATSAPP_PRIMARY_INBOX  "true" في متجر واحد فقط من المتاجر المتشاركة —
 *                           هو الذي يستقبل الأرقام غير المعروفة (زبون جديد لم
 *                           يطلب بعد). اتركه فارغاً في المتاجر الأخرى.
 *   WHATSAPP_OWN_DOMAINS    نطاقات هذا المتجر مفصولة بفواصل، تُستخدم لمطابقة
 *                           إعلانات «انقر للمراسلة». افتراضياً نطاق
 *                           NEXT_PUBLIC_SERVER_URL.
 *   WHATSAPP_FOREIGN_DOMAINS  نطاقات المتاجر الأخرى المتشاركة معك بالرقم. رسالة
 *                           قادمة من إعلان يشير إلى أحدها ليست لنا حتى لو كنا
 *                           الصندوق الرئيسي. (اختياري — لا يعمل إلا إذا ملأته)
 */

export type OwnershipReason =
  | "order" // للرقم طلب في قاعدة بيانات هذا المتجر
  | "ad" // الرسالة جاءت من إعلان يشير إلى نطاق هذا المتجر
  | "thread" // محادثة قائمة أصلاً هنا — لا نقطع خيط الرسائل
  | "primary" // رقم غير معروف، وهذا هو الصندوق الرئيسي
  | "foreign-ad" // إعلان يشير إلى نطاق متجر آخر
  | "foreign"; // زبون متجر آخر يتشارك نفس الرقم

function hostOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function parseDomains(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => hostOf(part))
    .filter((host): host is string => Boolean(host));
}

/** نطاقات هذا المتجر — للمقارنة مع رابط الإعلان في الرسائل الواردة */
export function getOwnDomains(): string[] {
  return parseDomains(
    process.env.WHATSAPP_OWN_DOMAINS || process.env.NEXT_PUBLIC_SERVER_URL || "",
  );
}

/** نطاقات المتاجر الأخرى المتشاركة بنفس الرقم — قائمة صريحة يملؤها المشرف */
export function getForeignDomains(): string[] {
  return parseDomains(process.env.WHATSAPP_FOREIGN_DOMAINS || "");
}

/** هل هذا النشر هو الصندوق الرئيسي الذي يستقبل الأرقام غير المعروفة؟ */
export function isPrimaryInbox(): boolean {
  return process.env.WHATSAPP_PRIMARY_INBOX === "true";
}

/**
 * مطابقة رابط الإعلان (referral.source_url) مع نطاقات هذا المتجر.
 * المطابقة «إضافية» فقط: عدم التطابق لا يعني أن الرسالة ليست لنا، لأن كثيراً
 * من الرسائل تصل بلا رابط إعلان أصلاً.
 */
function matchesDomain(sourceUrl: string | null | undefined, domains: string[]) {
  if (!sourceUrl || domains.length === 0) return false;
  const host = hostOf(sourceUrl);
  if (!host) return false;
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/** هل للرقم طلب في قاعدة بيانات هذا المتجر؟ (الطلبات المستوردة قد تحمل صيغة دولية) */
export async function hasLocalOrder(localPhone: string): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { phoneNumber: { in: [localPhone, toWaPhone(localPhone)] } },
    select: { id: true },
  });
  return Boolean(order);
}

/** هل نخزّن هذه الرسالة الواردة في هذا المتجر؟ */
export async function resolveInboundOwnership(params: {
  localPhone: string;
  referralSourceUrl?: string | null;
}): Promise<{ owned: boolean; reason: OwnershipReason }> {
  const { localPhone, referralSourceUrl } = params;

  if (await hasLocalOrder(localPhone)) return { owned: true, reason: "order" };

  if (matchesDomain(referralSourceUrl, getOwnDomains()))
    return { owned: true, reason: "ad" };

  // إعلان لمتجر آخر — لا نستقبله حتى لو كنا الصندوق الرئيسي
  if (matchesDomain(referralSourceUrl, getForeignDomains()))
    return { owned: false, reason: "foreign-ad" };

  const existing = await prisma.waConversation.findUnique({
    where: { phone: localPhone },
    select: { id: true },
  });
  if (existing) return { owned: true, reason: "thread" };

  if (isPrimaryInbox()) return { owned: true, reason: "primary" };

  return { owned: false, reason: "foreign" };
}

/**
 * هل حالة التسليم هذه تخص رسالة أرسلناها نحن؟
 *
 * نقبل أيضاً وجود محادثة للرقم لأن recordOutbound ينشئ المحادثة قبل صف الرسالة،
 * فقد تصل حالة "sent" سريعة قبل كتابة الرسالة في قاعدة البيانات.
 */
export async function ownsStatusUpdate(params: {
  messageExists: boolean;
  localPhone: string;
}): Promise<boolean> {
  if (params.messageExists) return true;
  const conversation = await prisma.waConversation.findUnique({
    where: { phone: params.localPhone },
    select: { id: true },
  });
  return Boolean(conversation);
}
