import { prisma } from "@/db/prisma";
import { getMetaConfig } from "@/lib/meta/config";
import { parseInboxReceiptEvents, verifyInboxWebhook } from "@/lib/meta/inbox-delivery";
import { saveInboxReceiptEvent } from "@/lib/meta/inbox-delivery-storage";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!token) return new Response("Webhook not configured", { status: 503 });
  if (params.get("hub.mode") !== "subscribe" || params.get("hub.verify_token") !== token) return new Response("Forbidden", { status: 403 });
  return new Response(params.get("hub.challenge") || "");
}

export async function POST(req: Request) {
  const config = getMetaConfig();
  if (!config) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 1024 * 1024) return new Response("Payload too large", { status: 413 });
  if (!verifyInboxWebhook(raw, req.headers.get("x-hub-signature-256"), config.appSecret)) return new Response("Forbidden", { status: 403 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  try {
    const conn = await prisma.metaConnection.findUnique({ where: { id: "default" }, select: { pages: true } });
    const assets = Array.isArray(conn?.pages) ? conn.pages as { id: string; instagram_business_account?: { id: string } }[] : [];
    for (const event of parseInboxReceiptEvents(payload, assets)) await saveInboxReceiptEvent(event);
    return new Response("EVENT_RECEIVED");
  } catch {
    // A non-2xx response lets Meta retry; never acknowledge an unpersisted receipt.
    console.error("[social-inbox] Receipt persistence failed");
    return new Response("Retry later", { status: 500 });
  }
}
