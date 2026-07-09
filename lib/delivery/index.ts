/**
 * نقطة الدخول لطبقة التوصيل.
 * تختار الشركة الفعّالة من متغيّر البيئة DELIVERY_PROVIDER (الافتراضي: modon).
 *
 * مثال في .env:
 *   DELIVERY_PROVIDER=modon   # أو prime
 */
import type { DeliveryProvider } from "./types";
import { modonProvider } from "./providers/modon";
import { primeProvider } from "./providers/prime";

export * from "./types";

const PROVIDERS: Record<string, DeliveryProvider> = {
  modon: modonProvider,
  prime: primeProvider,
};

/** يُعيد شركة التوصيل الفعّالة حسب DELIVERY_PROVIDER. */
export function getDeliveryProvider(): DeliveryProvider {
  const key = (process.env.DELIVERY_PROVIDER ?? "modon").toLowerCase().trim();
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(
      `Unknown DELIVERY_PROVIDER="${key}". المتوقّع أحد: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return provider;
}
