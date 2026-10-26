import { META_GRAPH_VERSION, META_SCOPES, type MetaConfig } from "./config";

/** Business Login configurations own their permissions; classic login uses scopes. */
export function buildMetaOAuthUrl(
  config: Pick<MetaConfig, "appId" | "loginConfigId">,
  redirectUri: string,
  state: string,
): URL {
  const dialog = new URL(
    `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
  );
  dialog.searchParams.set("client_id", config.appId);
  dialog.searchParams.set("redirect_uri", redirectUri);
  dialog.searchParams.set("state", state);
  dialog.searchParams.set("response_type", "code");
  if (config.loginConfigId) {
    dialog.searchParams.set("config_id", config.loginConfigId);
  } else {
    dialog.searchParams.set("scope", META_SCOPES.join(","));
  }
  dialog.searchParams.set("auth_type", "rerequest");
  return dialog;
}
