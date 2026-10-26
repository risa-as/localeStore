import { getSocialInboxSetup } from "@/lib/actions/social-inbox.actions";
import SocialInboxClient from "./social-inbox-client";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "رسائل وتعليقات فيسبوك وإنستغرام" };

export default async function SocialInboxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/sign-in?callbackUrl=${encodeURIComponent(`/${locale}/admin/social-inbox`)}`);
  if (session.user.role !== "admin") redirect(`/${locale}/unauthorized`);
  return <SocialInboxClient setup={await getSocialInboxSetup()} />;
}
