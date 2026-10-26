import crypto from "node:crypto";
import { messageDelivery, parseInboxReceiptEvents, verifyInboxWebhook } from "./inbox-delivery";
import { advanceDelivery, createInboxSendQueue, mergeOutbox } from "./inbox-outbox";

const now = Date.parse("2026-10-24T12:00:00Z");
const assets = [{ id: "page", instagram_business_account: { id: "ig" } }];
const payload = (event: object, object = "page", id = "page") => ({ object, entry: [{ id, messaging: [event] }] });
const event = { sender: { id: "customer" }, recipient: { id: "page" }, timestamp: now };

it("requires an exact signature over the raw body", () => {
  const raw = JSON.stringify(payload(event));
  const signature = "sha256=" + crypto.createHmac("sha256", "secret").update(raw).digest("hex");
  expect(verifyInboxWebhook(raw, signature, "secret")).toBe(true);
  expect(verifyInboxWebhook(raw + " ", signature, "secret")).toBe(false);
  expect(verifyInboxWebhook(raw, "sha256=00", "secret")).toBe(false);
  expect(verifyInboxWebhook(raw, null, "secret")).toBe(false);
});
it("accepts Facebook delivery/read acknowledgements only for the authorized receiving page", () => {
  const input = { ...event, delivery: { watermark: now - 5000, mids: ["m1", "m1"] }, read: { watermark: now - 1000 } };
  expect(parseInboxReceiptEvents(payload(input), assets, now)).toEqual([{
    pageId: "page", platform: "facebook", recipientId: "customer", at: new Date(now),
    deliveredThrough: new Date(now - 5000), readThrough: new Date(now - 1000), deliveredMids: ["m1"], readMids: [],
  }]);
  expect(parseInboxReceiptEvents(payload(input, "page", "other-page"), assets, now)).toEqual([]);
  expect(parseInboxReceiptEvents(payload({ ...input, recipient: { id: "other-page" } }), assets, now)).toEqual([]);
  expect(parseInboxReceiptEvents(payload({ ...input, sender: { id: "page" } }), assets, now)).toEqual([]);
});
it("handles Instagram seen mids without inventing delivery or a read watermark", () => {
  const [result] = parseInboxReceiptEvents(payload({ ...event, recipient: { id: "ig" }, read: { mid: "ig-mid" }, delivery: { watermark: now } }, "instagram", "ig"), assets, now);
  expect(result).toMatchObject({ pageId: "page", platform: "instagram", recipientId: "customer", readMids: ["ig-mid"], deliveredMids: [] });
  expect(result.readThrough).toBeUndefined(); expect(result.deliveredThrough).toBeUndefined();
});
it("ignores malformed and future watermarks and message echoes", () => {
  expect(parseInboxReceiptEvents(null, assets, now)).toEqual([]);
  expect(parseInboxReceiptEvents(payload({ ...event, read: { watermark: now + 3600000 } }), assets, now)).toEqual([]);
  expect(parseInboxReceiptEvents(payload({ ...event, message: { mid: "echo", is_echo: true } }), assets, now)).toEqual([]);
});
it("distinguishes API acceptance, delivery and actual read; reading the admin inbox is irrelevant", () => {
  const item = { id: "m1", outgoing: true, time: new Date(now - 2000).toISOString() };
  expect(messageDelivery(item)).toBe("sent");
  expect(messageDelivery(item, { deliveredThrough: new Date(now - 3000), readThrough: null })).toBe("sent");
  expect(messageDelivery(item, { deliveredThrough: new Date(now), readThrough: null })).toBe("delivered");
  expect(messageDelivery(item, { deliveredThrough: null, readThrough: new Date(now) })).toBe("read");
  expect(messageDelivery(item, null, { deliveredAt: null, readAt: new Date(now) })).toBe("read");
  expect(messageDelivery({ ...item, outgoing: false })).toBeUndefined();
  expect(messageDelivery({ ...item, time: "invalid" }, { deliveredThrough: new Date(now), readThrough: new Date(now) })).toBe("sent");
});
it("never downgrades a read/delivered message on a stale refresh and deduplicates optimistic confirmations by mid", () => {
  expect(advanceDelivery("read", "sent")).toBe("read");
  expect(advanceDelivery("delivered", "failed")).toBe("delivered");
  const item = { id: "mid", handle: "", title: "Page", text: "Hi", time: new Date(now).toISOString(), outgoing: true };
  const result = mergeOutbox([{ ...item, deliveryStatus: "read" }], [{ localId: "local", conversationId: "c", item: { ...item, deliveryStatus: "sent" }, previousMessageIds: [] }]);
  expect(result).toHaveLength(1); expect(result[0].deliveryStatus).toBe("read");
});
it("serializes messages for one conversation while other conversations send independently, including after failure", async () => {
  const queue = createInboxSendQueue();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const first = queue("page:customer1", async () => { calls.push("first"); await gate; throw new Error("rejected"); });
  const rejected = first.catch(() => {});
  const second = queue("page:customer1", async () => { calls.push("second"); });
  const other = queue("page:customer2", async () => { calls.push("other"); });
  await other; expect(calls).toEqual(["first", "other"]);
  release(); await Promise.all([rejected, second]);
  expect(calls).toEqual(["first", "other", "second"]);
});
