import { inspectInboxConnection, inboxTokenFingerprint } from "./inbox-connection";
import { graphGet, GraphError } from "./graph";

jest.mock("./graph", () => ({ graphGet: jest.fn(), GraphError: class extends Error {} }));
const get = jest.mocked(graphGet);
const input = { pageId: "page1", platform: "facebook" as const, pageToken: "PRIVATE_PAGE", userToken: "PRIVATE_USER", appId: "app1", appSecret: "PRIVATE_SECRET" };
const info = { app_id: "app1", is_valid: true, type: "PAGE", profile_id: "page1", expires_at: 0,
  data_access_expires_at: Math.floor(Date.now() / 1000) + 3600, scopes: ["pages_messaging"],
  granular_scopes: [{ scope: "pages_messaging", target_ids: ["page1"] }] };
beforeEach(() => { get.mockReset(); });
function responses(tokenInfo = info) {
  get.mockResolvedValueOnce({ data: tokenInfo }).mockResolvedValueOnce({ id: "page1" })
    .mockResolvedValueOnce({ data: [{ permission: "pages_messaging", status: "granted" }] });
}
it("checks the sending Page token, identity and granted permission without claiming delivery or App Review", async () => {
  responses();
  const result = await inspectInboxConnection(input);
  expect(result).toMatchObject({ status: "healthy", issues: [], message: expect.stringContaining("اعتماد التطبيق") });
  expect(get).toHaveBeenCalledWith("debug_token", "app1|PRIVATE_SECRET", { input_token: "PRIVATE_PAGE" }, expect.anything());
  expect(get).toHaveBeenCalledWith("me", "PRIVATE_PAGE", { fields: "id" }, expect.anything());
  expect(get).toHaveBeenCalledWith("me/permissions", "PRIVATE_USER", undefined, expect.anything());
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it.each([
  [{ app_id: "anotherApp" }, "تابع لتطبيق آخر"],
  [{ type: "USER" }, "ليس رمز صفحة"],
  [{ profile_id: "anotherPage" }, "يخص صفحة أخرى"],
  [{ is_valid: false }, "غير صالح"],
  [{ expires_at: 1 }, "انتهت مدة"],
  [{ data_access_expires_at: 1 }, "انتهت مدة"],
  [{ scopes: [] }, "لا يحمل إذن"],
  [{ granular_scopes: [{ scope: "pages_messaging", target_ids: ["anotherPage"] }] }, "غير ممنوح لهذه الصفحة"],
])("detects a sending credential problem even when the user granted messaging: %j", async (change, phrase) => {
  responses({ ...info, ...change });
  const result = await inspectInboxConnection(input);
  expect(result.status).toBe("attention");
  expect(result.issues.join(" ")).toContain(phrase);
});
it("detects a Page identity mismatch independently of debugger metadata", async () => {
  get.mockResolvedValueOnce({ data: info }).mockResolvedValueOnce({ id: "page2" })
    .mockResolvedValueOnce({ data: [{ permission: "pages_messaging", status: "granted" }] });
  expect((await inspectInboxConnection(input)).issues.join(" ")).toContain("هوية رمز الإرسال");
});
it("does not expose Graph exceptions, credentials, IDs or customer data on a partial check", async () => {
  get.mockRejectedValueOnce(new Error("PRIVATE_SECRET in Graph URL"))
    .mockRejectedValueOnce(Object.assign(new GraphError(400, "PRIVATE_PAGE", 190), { code: 190 }))
    .mockRejectedValueOnce(new Error("PRIVATE_USER"));
  const result = await inspectInboxConnection(input);
  expect(result.status).toBe("unknown");
  expect(result.issues).toHaveLength(3);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("requires an explicitly granted user permission", async () => {
  get.mockResolvedValueOnce({ data: info }).mockResolvedValueOnce({ id: "page1" })
    .mockResolvedValueOnce({ data: [{ permission: "pages_messaging", status: "declined" }] });
  expect((await inspectInboxConnection(input)).issues.join(" ")).toContain("لم يمنح إذن");
});
it("does not call a token healthy when Meta omitted its app or permission metadata", async () => {
  get.mockResolvedValueOnce({ data: { is_valid: true } }).mockResolvedValueOnce({ id: "page1" })
    .mockResolvedValueOnce({ data: [{ permission: "pages_messaging", status: "granted" }] });
  expect((await inspectInboxConnection(input)).status).toBe("unknown");
});
it("checks Instagram permission without treating IG scoped target IDs as Page IDs", async () => {
  get.mockResolvedValueOnce({ data: { ...info, scopes: ["instagram_manage_messages"],
    granular_scopes: [{ scope: "instagram_manage_messages", target_ids: ["ig1"] }] } })
    .mockResolvedValueOnce({ id: "page1" })
    .mockResolvedValueOnce({ data: [{ permission: "instagram_manage_messages", status: "granted" }] });
  expect((await inspectInboxConnection({ ...input, platform: "instagram" })).status).toBe("healthy");
});
it("fingerprints change with the token or secret and never contain the token", () => {
  const fingerprint = inboxTokenFingerprint("PRIVATE_PAGE", "secret");
  expect(fingerprint).toMatch(/^[a-f0-9]{16}$/);
  expect(fingerprint).toBe(inboxTokenFingerprint("PRIVATE_PAGE", "secret"));
  expect(fingerprint).not.toBe(inboxTokenFingerprint("NEW_PRIVATE_PAGE", "secret"));
  expect(fingerprint).not.toBe(inboxTokenFingerprint("PRIVATE_PAGE", "another secret"));
});
