import { inboxMediaKind } from "./inbox-media";
import { signInboxMedia, verifyInboxMedia } from "./inbox-media-ticket";

const scope = { userId: "admin1", pageId: "page1", platform: "facebook" as const, conversationId: "thread1" };
const media = { kind: "image" as const, name: "photo.jpg", size: 100, url: "https://demo.ufs.sh/f/photo" };
const now = 1234567890000;
it("accepts supported media within the size boundary and rejects oversize, empty and unsupported files", () => {
  expect(inboxMediaKind({ type: "image/jpeg", name: "p.jpg", size: 8 * 1024 * 1024 })).toBe("image");
  expect(inboxMediaKind({ type: "video/mp4", name: "v.mp4", size: 25 * 1024 * 1024 })).toBe("video");
  for (const file of [{ type: "image/svg+xml", size: 1 }, { type: "image/png", size: 0 },
    { type: "image/png", size: 8 * 1024 * 1024 + 1 }, { type: "video/mp4", size: 25 * 1024 * 1024 + 1 }])
    expect(() => inboxMediaKind({ ...file, name: "file" })).toThrow();
});
it("accepts only a signed completion belonging to the same administrator, Page, platform and conversation", () => {
  const ticket = signInboxMedia(scope, media, "secret", now);
  expect(verifyInboxMedia(scope, ticket, "secret", now)).toEqual(media);
  for (const changed of [{ userId: "admin2" }, { pageId: "other" }, { platform: "instagram" as const }, { conversationId: "other" }])
    expect(() => verifyInboxMedia({ ...scope, ...changed }, ticket, "secret", now)).toThrow();
  expect(() => verifyInboxMedia(scope, ticket + "x", "secret", now)).toThrow();
  expect(() => verifyInboxMedia(scope, ticket, "other-secret", now)).toThrow();
  expect(() => verifyInboxMedia(scope, ticket, "secret", now + 86400000)).toThrow();
});
it("never authorizes arbitrary, insecure or deceptive media URLs", () => {
  for (const url of ["http://demo.ufs.sh/file", "https://demo.ufs.sh.evil.example/file", "https://localhost/file",
    "https://example.org/file", "https://user:pass@demo.ufs.sh/file", "https://demo.ufs.sh:4433/file"])
    expect(() => signInboxMedia(scope, { ...media, url }, "secret", now)).toThrow();
});
