export const INBOX_MEDIA_ACCEPT = "image/jpeg,image/png,image/gif,video/mp4";
export type InboxMediaKind = "image" | "video";
export type InboxMedia = { kind: InboxMediaKind; url: string; name: string; size: number };
export type UploadedInboxMedia = InboxMedia & { ticket: string };

// Conservative limits shared by the picker, upload authorization and send validation.
export function inboxMediaKind(file: { type: string; size: number; name: string }): InboxMediaKind {
  const kind = ["image/jpeg", "image/png", "image/gif"].includes(file.type) ? "image"
    : file.type === "video/mp4" ? "video" : null;
  if (!kind) throw new Error("اختر صورة JPG أو PNG أو GIF، أو فيديو MP4");
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > (kind === "image" ? 8 : 25) * 1024 * 1024)
    throw new Error(kind === "image" ? "حجم الصورة يجب ألا يتجاوز 8 ميغابايت" : "حجم الفيديو يجب ألا يتجاوز 25 ميغابايت");
  if (!file.name || file.name.length > 255) throw new Error("اسم الملف غير صالح أو طويل جداً");
  return kind;
}
