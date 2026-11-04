const pad = (value: number) => String(value).padStart(2, "0");
// Left-to-right isolate, so «2026-11-04 21:43» never flips inside Arabic text.
const LTR = (text: string) => `${String.fromCharCode(0x2066)}${text}${String.fromCharCode(0x2069)}`;

/** Inbox dates as «2026-11-04 21:43» (local time, Latin digits); `withTime: false` gives «2026-11-04». */
export function inboxDate(value: string | Date | null | undefined, withTime = true) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return LTR(withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day);
}
