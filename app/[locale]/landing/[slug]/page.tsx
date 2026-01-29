import { getProductBySlug } from "@/lib/actions/product.actions";
import { notFound } from "next/navigation";
import LandingPage from "@/components/shared/product/landing-page";

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

    return <LandingPage product={product} />
}
