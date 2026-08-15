export const revalidate = 3600;

import type { ComponentType } from "react";
import { getProductBySlug } from "@/lib/actions/product.actions";
import { getAvailableStock } from "@/lib/inventory";
import { notFound } from "next/navigation";
import LandingPage from "@/components/shared/product/landing-page";
import CinematicSytFathMfasl from "@/components/shared/product/cinematic/syt-fath-mfasl";
import { Product } from "@/types";

// Products with a dedicated cinematic landing page; all other slugs
// fall back to the generic LandingPage.
const cinematicPages: Record<
    string,
    ComponentType<{ product: Product; availableStock: number }>
> = {
    "syt-fath-mfasl": CinematicSytFathMfasl,
};

export async function generateMetadata(props: {
    params: Promise<{ slug: string }>;
}) {
    const params = await props.params;
    const product = await getProductBySlug(params.slug);
    if (!product) {
        return { title: "Product not found" };
    }
    return {
        title: product.name,
        description: product.description,
    };
}

export default async function LandingPageRoute(props: {
    params: Promise<{ slug: string }>;
}) {
    const params = await props.params;
    const product = await getProductBySlug(params.slug);

    if (!product) {
        notFound();
    }
    const serializedProduct = JSON.parse(JSON.stringify(product));
    // product.stock هو مجموع الدفعات المستلمة، لا المتبقي — نحسب المتاح فعلاً
    const availableStock = await getAvailableStock(product.id, product.stock);

    const Cinematic = cinematicPages[params.slug];
    if (Cinematic) {
        return (
            <Cinematic product={serializedProduct} availableStock={availableStock} />
        );
    }
    return <LandingPage product={serializedProduct} availableStock={availableStock} />
}
