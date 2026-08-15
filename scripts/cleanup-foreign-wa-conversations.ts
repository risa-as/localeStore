import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * تنظيف المحادثات التي وصلت من متجر آخر يتشارك نفس رقم واتساب.
 *
 * قبل فلترة الويبهوك (lib/whatsapp-tenant.ts) كانت كل قاعدة بيانات تخزّن رسائل
 * زبائن الطرفين. هذا السكربت يحذف المحادثات التي لا يوجد لرقمها أي طلب في قاعدة
 * بيانات هذا المتجر — أي زبائن المتجر الآخر.
 *
 *   npx tsx scripts/cleanup-foreign-wa-conversations.ts            # عرض فقط
 *   npx tsx scripts/cleanup-foreign-wa-conversations.ts --apply    # حذف فعلي
 *
 * ⚠️ لا تشغّله على «الصندوق الرئيسي» (WHATSAPP_PRIMARY_INBOX=true) لأنه سيحذف
 * أيضاً الزبائن الجدد الذين راسلوك ولم يطلبوا بعد. استخدم --force إن كنت متأكداً.
 */

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

// 07XXXXXXXXX → 9647XXXXXXXX (نسخة محلية من toWaPhone لتفادي استيراد وحدة الخادم)
function toWaPhone(local: string): string {
  const trimmed = (local || "").replace(/\s+/g, "");
  if (trimmed.startsWith("964")) return trimmed;
  return "964" + trimmed.substring(1);
}

async function main() {
  const { prisma } = await import("../db/prisma");

  if (process.env.WHATSAPP_PRIMARY_INBOX === "true" && !FORCE) {
    console.log(
      "⛔ هذا النشر هو الصندوق الرئيسي (WHATSAPP_PRIMARY_INBOX=true).\n" +
        "   المحادثات بلا طلبات قد تكون زبائن جدد حقيقيين. أضف --force للمتابعة.",
    );
    await prisma.$disconnect();
    return;
  }

  const conversations = await prisma.waConversation.findMany({
    select: {
      id: true,
      phone: true,
      customerName: true,
      lastMessageAt: true,
      _count: { select: { messages: true } },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  console.log(`💬 مجموع المحادثات في قاعدة البيانات: ${conversations.length}`);
  if (conversations.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const phones = conversations.map((c) => c.phone);
  const orders = await prisma.order.findMany({
    where: { phoneNumber: { in: [...phones, ...phones.map(toWaPhone)] } },
    select: { phoneNumber: true },
    distinct: ["phoneNumber"],
  });
  const ourPhones = new Set<string>();
  for (const o of orders) {
    ourPhones.add(o.phoneNumber);
    ourPhones.add(o.phoneNumber.startsWith("964") ? "0" + o.phoneNumber.slice(3) : o.phoneNumber);
  }

  const foreign = conversations.filter((c) => !ourPhones.has(c.phone));
  const foreignMessages = foreign.reduce((sum, c) => sum + c._count.messages, 0);

  console.log(`✅ محادثات لزبائن هذا المتجر: ${conversations.length - foreign.length}`);
  console.log(`🚫 محادثات بلا طلبات هنا: ${foreign.length} (${foreignMessages} رسالة)\n`);

  for (const c of foreign) {
    console.log(
      `  ${c.phone} | ${c.customerName ?? "بلا اسم"} | ${c._count.messages} رسالة | آخر رسالة ${c.lastMessageAt.toISOString().slice(0, 10)}`,
    );
  }

  if (!APPLY) {
    console.log("\n👀 عرض فقط — أضف --apply للحذف الفعلي.");
    await prisma.$disconnect();
    return;
  }

  if (foreign.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // الرسائل تُحذف تلقائياً مع المحادثة (onDelete: Cascade)
  const deleted = await prisma.waConversation.deleteMany({
    where: { id: { in: foreign.map((c) => c.id) } },
  });
  console.log(`\n🗑️ تم حذف ${deleted.count} محادثة.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
