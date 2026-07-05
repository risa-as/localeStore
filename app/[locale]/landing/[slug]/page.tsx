export const revalidate = 3600;

import type { ComponentType } from "react";
import { getProductBySlug } from "@/lib/actions/product.actions";
import { notFound } from "next/navigation";
import LandingPage from "@/components/shared/product/landing-page";
import CinematicSytFathMfasl from "@/components/shared/product/cinematic/syt-fath-mfasl";
import { Product } from "@/types";

// Products with a dedicated cinematic landing page; all other slugs
// fall back to the generic LandingPage.
const cinematicPages: Record<string, ComponentType<{ product: Product }>> = {
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
    const Cinematic = cinematicPages[params.slug];
    if (Cinematic) {
        return <Cinematic product={serializedProduct} />;
    }
    return <LandingPage product={serializedProduct} />
}
