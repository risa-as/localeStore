import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { getMetaStatus } from "@/lib/actions/meta.actions";
import MarketingClient from "./marketing-client";

export const metadata: Metadata = { title: "التسويق" };

const MarketingPage = async (props: {
  searchParams: Promise<{ meta?: string }>;
}) => {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const { meta } = await props.searchParams;
  const status = await getMetaStatus();

  return <MarketingClient status={status} flash={meta ?? null} />;
};

export default MarketingPage;
