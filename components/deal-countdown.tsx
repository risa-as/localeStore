import { getDealSettings } from "@/lib/actions/deal-settings.actions";
import { getProductById } from "@/lib/actions/product.actions";
import DealCountdownClient from "@/components/deal-countdown-client";

const DealCountdown = async () => {
  const settings = await getDealSettings();

  if (!settings.isActive) return null;

  const now = new Date();
  if (new Date(settings.endDate) <= now) return null;

  let productImage: string | null = null;
  let productSlug: string | null = null;

  if (settings.productId) {
    const product = await getProductById(settings.productId);
    if (product) {
      productImage = product.images?.[0] ?? null;
      productSlug = product.slug;
    }
  }

  return (
    <DealCountdownClient
      endDate={settings.endDate.toISOString()}
      title={settings.title}
      productImage={productImage}
      productSlug={productSlug}
    />
  );
};

export default DealCountdown;
