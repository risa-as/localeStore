import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { getMetaStatus } from "@/lib/actions/meta.actions";
import { getSocialFeed, getAdMeta } from "@/lib/actions/social.actions";
import MarketingClient from "./marketing-client";

export const metadata: Metadata = { title: "التسويق" };

const MarketingPage = async (props: {
  searchParams: Promise<{ meta?: string }>;
}) => {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const { meta } = await props.searchParams;
  const status = await getMetaStatus();

  // لوحة النشر تُحمّل فقط عند وجود اتصال فعّال.
  const [feed, adMeta] = status.connected
    ? await Promise.all([getSocialFeed(), getAdMeta()])
    : [null, null];

  return (
    <MarketingClient
      status={status}
      flash={meta ?? null}
      feed={feed}
      adMeta={adMeta}
    />
  );
};

export default MarketingPage;
