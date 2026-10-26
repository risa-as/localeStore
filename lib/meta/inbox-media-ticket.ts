import crypto from "crypto";
import type { InboxMedia } from "./inbox-media";
import type { SocialPlatform } from "./inbox";

export type InboxMediaScope = { userId: string; pageId: string; platform: SocialPlatform; conversationId: string };
const hostAllowed = (url: string) => {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && !u.port &&
    (u.hostname === "utfs.io" || u.hostname.endsWith(".ufs.sh")); } catch { return false; }
};
function validMedia(media: InboxMedia) {
  return media && ["image", "video"].includes(media.kind) && typeof media.url === "string" && hostAllowed(media.url) &&
    typeof media.name === "string" && media.name.length > 0 && media.name.length <= 255 &&
    Number.isFinite(media.size) && media.size > 0 && media.size <= (media.kind === "image" ? 8 : 25) * 1024 * 1024;
}
// Only a verified UploadThing completion can issue a media capability. The send
// action checks its signature and scope; it never fetches arbitrary client URLs.
export function signInboxMedia(scope: InboxMediaScope, media: InboxMedia, secret: string, now = Date.now()) {
  if (!secret || !validMedia(media)) throw new Error("بيانات المرفق غير صالحة");
  const body = Buffer.from(JSON.stringify({ scope, media, expires: now + 86400000 })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", secret).update(`inbox-media:${body}`).digest("base64url")}`;
}
export function verifyInboxMedia(scope: InboxMediaScope, ticket: string, secret: string, now = Date.now()): InboxMedia {
  try {
    if (!secret || typeof ticket !== "string" || ticket.length > 12000) throw new Error();
    const [body, sig, extra] = ticket.split(".");
    if (!body || !sig || extra) throw new Error();
    const actual = Buffer.from(sig, "base64url"), expected = crypto.createHmac("sha256", secret).update(`inbox-media:${body}`).digest();
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error();
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!Number.isFinite(data.expires) || data.expires <= now || !validMedia(data.media) ||
      !data.scope || Object.entries(scope).some(([key, value]) => data.scope[key] !== value)) throw new Error();
    return { kind: data.media.kind, url: data.media.url, name: data.media.name, size: data.media.size };
  } catch { throw new Error("انتهت صلاحية المرفق أو لا يخص هذه المحادثة؛ أزل الملف واختره مجدداً"); }
}
