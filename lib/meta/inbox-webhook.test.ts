import crypto from "node:crypto";
import { GET, POST } from "@/app/api/meta/webhook/route";
import { prisma } from "@/db/prisma";
import { saveInboxReceiptEvent } from "./inbox-delivery-storage";
jest.mock("@/db/prisma", () => ({ prisma: { metaConnection: { findUnique: jest.fn() } } }));
jest.mock("./config", () => ({ getMetaConfig: () => ({ appSecret: "test-secret" }) }));
jest.mock("./inbox-delivery-storage", () => ({ saveInboxReceiptEvent: jest.fn() }));
beforeEach(() => {
  jest.resetAllMocks(); process.env.META_WEBHOOK_VERIFY_TOKEN = "test-verify";
  jest.mocked(prisma.metaConnection.findUnique).mockResolvedValue({ pages: [{ id: "page" }] } as never);
});
afterEach(() => { delete process.env.META_WEBHOOK_VERIFY_TOKEN; });
const request = (raw: string, signature = "sha256=" + crypto.createHmac("sha256", "test-secret").update(raw).digest("hex")) => new Request("https://store.example/api/meta/webhook", {
  method: "POST", headers: { "x-hub-signature-256": signature }, body: raw,
});
it("verifies the configured challenge token", async () => {
  expect(await (await GET(new Request("https://store.example/api/meta/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123"))).text()).toBe("123");
  expect((await GET(new Request("https://store.example/api/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong"))).status).toBe(403);
});
it("rejects forged callbacks before database reads/writes", async () => {
  expect((await POST(request("{}", "sha256=00"))).status).toBe(403);
  expect(prisma.metaConnection.findUnique).not.toHaveBeenCalled(); expect(saveInboxReceiptEvent).not.toHaveBeenCalled();
});
it("persists a signed read event only for a connected page and returns retryable failure if storage fails", async () => {
  const raw = JSON.stringify({ object: "page", entry: [{ id: "page", messaging: [{ sender: { id: "customer" }, recipient: { id: "page" }, timestamp: Date.now(), read: { watermark: Date.now() } }] }] });
  expect((await POST(request(raw))).status).toBe(200); expect(saveInboxReceiptEvent).toHaveBeenCalledTimes(1);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    jest.mocked(saveInboxReceiptEvent).mockRejectedValueOnce(new Error("storage unavailable"));
    expect((await POST(request(raw))).status).toBe(500);
  } finally { log.mockRestore(); }
  jest.mocked(saveInboxReceiptEvent).mockClear();
  expect((await POST(request(raw.replaceAll('"page"', '"unowned"')))).status).toBe(200);
  expect(saveInboxReceiptEvent).not.toHaveBeenCalled();
});
