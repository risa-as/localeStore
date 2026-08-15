import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * محاكاة رسالة واردة من واتساب على جهازك.
 *
 * Meta لا تستطيع الوصول إلى http://localhost:3000 لذلك لا يصل أي ويبهوك أثناء
 * التطوير — الردود الحقيقية تذهب إلى النشر الذي يشير إليه Callback URL. هذا
 * السكربت يبني نفس شكل حمولة Meta ويوقّعها بـ WHATSAPP_APP_SECRET ويرسلها إلى
 * مسار الويبهوك محلياً، فتظهر الرسالة في /admin/chats كأنها وصلت فعلاً.
 *
 *   npx tsx scripts/simulate-wa-webhook.ts --phone 07519232339 --text "مرحبا"
 *   npx tsx scripts/simulate-wa-webhook.ts --phone 07700000000 --referral https://store.al-shafaq03.com/ar/landing/x
 *   npx tsx scripts/simulate-wa-webhook.ts --phone 07700000000 --url https://preview.vercel.app/api/whatsapp/webhook
 */

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// 07XXXXXXXXX → 9647XXXXXXXX
function toWaPhone(local: string): string {
  const trimmed = (local || "").replace(/\s+/g, "");
  if (trimmed.startsWith("964")) return trimmed;
  return "964" + trimmed.substring(1);
}

async function main() {
  const phone = arg("phone");
  if (!phone) {
    console.error("❌ مطلوب: --phone 07XXXXXXXXX");
    process.exit(1);
  }

  const text = arg("text", "رسالة اختبار محلية");
  const name = arg("name", "زبون اختبار");
  const referral = arg("referral");
  const target = arg(
    "url",
    `${process.env.NEXT_PUBLIC_SERVER_URL?.startsWith("http") ? process.env.NEXT_PUBLIC_SERVER_URL : "http://localhost:3000"}/api/whatsapp/webhook`,
  );

  const waId = toWaPhone(phone);
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SIMULATED_WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "0000000000",
                phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "0",
              },
              contacts: [{ profile: { name }, wa_id: waId }],
              messages: [
                {
                  from: waId,
                  id: `wamid.SIM${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "text",
                  text: { body: text },
                  ...(referral
                    ? {
                        referral: {
                          source_url: referral,
                          source_type: "ad",
                          source_id: "SIMULATED_AD",
                        },
                      }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // نفس التوقيع الذي ترسله Meta — بدونه يرفض المسار الطلب عند ضبط App Secret
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    headers["x-hub-signature-256"] =
      "sha256=" +
      crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  }

  console.log(`📨 إرسال رسالة واردة محاكاة إلى ${target}`);
  console.log(`   من ${phone}${referral ? ` | إعلان: ${referral}` : ""}`);

  const res = await fetch(target, { method: "POST", headers, body: rawBody });
  console.log(`   الرد: ${res.status} ${await res.text()}`);
  console.log(
    "\nافتح /admin/chats — إن لم تظهر الرسالة فراجع سجل الخادم: قد تكون فلترة\n" +
      "المتاجر (lib/whatsapp-tenant.ts) تجاهلتها لأن الرقم ليس من زبائن هذا المتجر.",
  );
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
