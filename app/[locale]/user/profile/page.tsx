import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { SessionProvider } from "next-auth/react";
import ProfileForm from "./profile-form";

export const metadata: Metadata = {
  title: "Customer Profile",
};

const Profile = async () => {
  const session = await auth();
  const t = await getTranslations("Profile");

  return (
    <SessionProvider session={session}>
      <div className="max-w-md mx-auto space-y-4">
        <h2 className="h2-bold">{t('title')}</h2>
        <ProfileForm />
      </div>
    </SessionProvider>
  );
};

export default Profile;
