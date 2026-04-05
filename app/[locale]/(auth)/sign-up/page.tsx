import { APP_NAME } from "@/lib/constants";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import CredentialsSignUpForm from "./credentials-signup-form";
import { getTranslations } from "next-intl/server";
import { getLogoUrl } from "@/lib/get-logo";

export const metadata: Metadata = { title: "إنشاء حساب" };

const SignUpPage = async (props: {
  searchParams: Promise<{ callbackUrl: string }>;
}) => {
  const { callbackUrl } = await props.searchParams;
  const session = await auth();
  if (session) return redirect(callbackUrl || "/");
  const t = await getTranslations("Auth");
  const logoUrl = await getLogoUrl();

  return (
    <div className="w-full max-w-md">
      <div className="rounded-3xl border-2 bg-card shadow-2xl shadow-primary/10 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-primary to-orange-300" />

        <div className="p-7 sm:p-10 space-y-7">
          <div className="flex flex-col items-center gap-4">
            <Link href="/">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Image
                  src={logoUrl}
                  width={52}
                  height={52}
                  alt={APP_NAME}
                  priority
                  className="rounded-xl"
                />
              </div>
            </Link>
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-extrabold">{t("createAccountTitle")}</h1>
              <p className="text-base text-muted-foreground">{t("createAccountDescription")}</p>
            </div>
          </div>

          <CredentialsSignUpForm />
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
