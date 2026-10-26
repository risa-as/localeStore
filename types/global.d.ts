/** دالة بكسل ميتا التي يحقنها fbevents.js في نافذة المتصفح. */
type FacebookPixelFn = (
  method: "init" | "track" | "trackCustom",
  eventNameOrPixelId: string,
  data?: Record<string, unknown>,
  options?: { eventID?: string },
) => void;

interface Window {
  fbq?: FacebookPixelFn;
  _fbq?: unknown;
}
