import crypto from "node:crypto";
import type { InboxItem, SocialPlatform } from "./inbox";

export type DeliveryStatus = "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "uncertain";
export type ReceiptEvent = { pageId: string; platform: SocialPlatform; recipientId: string;
  deliveredThrough?: Date; readThrough?: Date; deliveredMids: string[]; readMids: string[]; at: Date };
type Asset = { id: string; instagram_business_account?: { id: string } };
type Payload = { object?: string; entry?: { id?: string; messaging?: {
  sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number;
  delivery?: { watermark?: number; mids?: string[] }; read?: { watermark?: number; mid?: string };
}[] }[] };

export function verifyInboxWebhook(raw: string, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return crypto.timingSafeEqual(crypto.createHmac("sha256", secret).update(raw).digest(), Buffer.from(signature.slice(7), "hex"));
}

export function parseInboxReceiptEvents(payload: unknown, assets: Asset[], now = Date.now()): ReceiptEvent[] {
  const body = payload as Payload | null;
  if (!body || !["page", "instagram"].includes(body.object || "") || !Array.isArray(body.entry)) return [];
  const timestamp = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= now + 300000 ? new Date(value) : undefined;
  const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 2000;
  const events: ReceiptEvent[] = [];
  for (const entry of body.entry.slice(0, 100)) {
    const platform = body.object === "page" ? "facebook" : "instagram";
    const asset = assets.find(page => (platform === "facebook" ? page.id : page.instagram_business_account?.id) === entry?.id);
    if (!asset || !Array.isArray(entry.messaging)) continue;
    for (const event of entry.messaging.slice(0, 100)) {
      // Only inbound acknowledgements from the customer to this authorized asset.
      if (!event || event.recipient?.id !== entry.id || !id(event.sender?.id) || event.sender.id === entry.id) continue;
      const at = timestamp(event.timestamp) || new Date(now);
      const deliveredThrough = platform === "facebook" ? timestamp(event.delivery?.watermark) : undefined;
      const readThrough = platform === "facebook" ? timestamp(event.read?.watermark) : undefined;
      const deliveredMids = platform === "facebook" && Array.isArray(event.delivery?.mids) ? [...new Set(event.delivery.mids.filter(id))].slice(0, 100) : [];
      const readMids = id(event.read?.mid) ? [event.read.mid] : [];
      if (deliveredThrough || readThrough || deliveredMids.length || readMids.length)
        events.push({ pageId: asset.id, platform, recipientId: event.sender.id, deliveredThrough, readThrough, deliveredMids, readMids, at });
    }
  }
  return events;
}

export function messageDelivery(item: Pick<InboxItem, "id" | "time" | "outgoing">,
  peer?: { deliveredThrough: Date | null; readThrough: Date | null } | null,
  receipt?: { deliveredAt: Date | null; readAt: Date | null } | null): DeliveryStatus | undefined {
  if (!item.outgoing) return undefined;
  const sent = Date.parse(item.time);
  if (receipt?.readAt || (Number.isFinite(sent) && peer?.readThrough && sent <= peer.readThrough.getTime())) return "read";
  if (receipt?.deliveredAt || (Number.isFinite(sent) && peer?.deliveredThrough && sent <= peer.deliveredThrough.getTime())) return "delivered";
  return "sent";
}
