import { buildMetaOAuthUrl } from "./oauth";
import { META_SCOPES } from "./config";

const redirect = "https://store.example/api/meta/oauth/callback";

describe("Meta OAuth dialog", () => {
  it("uses the business configuration without overriding its permissions", () => {
    const url = buildMetaOAuthUrl(
      { appId: "123", loginConfigId: "456" },
      redirect,
      "signed.state",
    );
    expect(url.searchParams.get("config_id")).toBe("456");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
    expect(url.searchParams.get("state")).toBe("signed.state");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("preserves scope based login for existing deployments without a configuration", () => {
    const url = buildMetaOAuthUrl({ appId: "123" }, redirect, "state");
    expect(url.searchParams.has("config_id")).toBe(false);
    expect(url.searchParams.get("scope")).toBe(META_SCOPES.join(","));
    expect(url.searchParams.get("auth_type")).toBe("rerequest");
  });
});
