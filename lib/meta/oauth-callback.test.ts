import { GET } from "@/app/api/meta/oauth/callback/route";
import { prisma } from "@/db/prisma";
import { graphGet, graphGetAll, oauthExchange } from "./graph";
import { verifyOAuthState } from "./config";

jest.mock("@/lib/authorization", () => ({ requireAdministrator: async () => ({ user: { id: "admin1", role: "admin" } }) }));
jest.mock("@/db/prisma", () => ({ prisma: { metaConnection: { findUnique: jest.fn(), upsert: jest.fn() } } }));
jest.mock("./config", () => ({ getMetaConfig: () => ({ appId: "app1", appSecret: "SECRET" }),
  getRedirectUri: () => "https://store.example/api/meta/oauth/callback", verifyOAuthState: jest.fn(() => true) }));
jest.mock("./graph", () => ({ graphGet: jest.fn(), graphGetAll: jest.fn(), oauthExchange: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(verifyOAuthState).mockReturnValue(true);
  jest.mocked(prisma.metaConnection.findUnique).mockResolvedValue(null);
  jest.mocked(oauthExchange).mockResolvedValue({ access_token: "PRIVATE_USER", expires_in: 3600 });
  jest.mocked(graphGet).mockImplementation(async path => path === "debug_token"
    ? { data: { is_valid: true, app_id: "app1" } } : { id: "fb-user", name: "Owner" });
});
it("keeps authorized pages when ad discovery fails without selecting the first Page", async () => {
  const pages = [{ id: "page1", name: "Page", access_token: "PRIVATE_PAGE" }];
  jest.mocked(graphGetAll).mockImplementation(async path => {
    if (path === "me/accounts") return pages;
    if (path === "me/adaccounts") throw new Error("ads permission unavailable");
    return [{ permission: "pages_messaging", status: "granted" }];
  });
  const res = await GET(new Request("https://store.example/api/meta/oauth/callback?code=test&state=test"));
  expect(res.headers.get("location")).toContain("meta=connected_partial");
  expect(prisma.metaConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
    create: expect.objectContaining({ pages, adAccounts: [], scopes: ["pages_messaging"], selectedPageId: null, selectedAdAccountId: null }),
  }));
});
it("rejects invalid OAuth state before any token exchange or asset persistence", async () => {
  jest.mocked(verifyOAuthState).mockReturnValue(false);
  const res = await GET(new Request("https://store.example/api/meta/oauth/callback?code=test&state=invalid"));
  expect(res.headers.get("location")).toContain("meta=invalid");
  expect(oauthExchange).not.toHaveBeenCalled();
  expect(prisma.metaConnection.upsert).not.toHaveBeenCalled();
});
it("preserves the stored connection when the exchanged token belongs to another app", async () => {
  jest.mocked(graphGet).mockResolvedValueOnce({ data: { is_valid: true, app_id: "anotherApp" } });
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const res = await GET(new Request("https://store.example/api/meta/oauth/callback?code=test&state=test"));
    expect(res.headers.get("location")).toContain("meta=failed");
    expect(prisma.metaConnection.upsert).not.toHaveBeenCalled();
    expect(graphGetAll).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
  } finally { log.mockRestore(); }
});
