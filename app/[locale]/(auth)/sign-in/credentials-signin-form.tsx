"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInDefaultValues } from "@/lib/constants";
import { Link } from "@/i18n/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithCredentials } from "@/lib/actions/user.actions";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Mail, Lock } from "lucide-react";

const CredentialsSignInForm = () => {
  const t = useTranslations("Auth");
  const [data, action] = useActionState(signInWithCredentials, { success: false, message: "" });
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const SignInButton = () => {
    const { pending } = useFormStatus();
    return (
      <Button
        disabled={pending}
        className="w-full h-14 text-base font-bold rounded-2xl gap-2 shadow-lg shadow-primary/20"
      >
        {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
        {pending ? t("signingInButton") : t("signInButton")}
      </Button>
    );
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div className="space-y-2">
        <Label htmlFor="email" className="text-base font-semibold">{t("email")}</Label>
        <div className="relative">
          <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={signInDefaultValues.email}
            className="h-13 ps-11 text-base rounded-xl border-2 focus:border-primary"
            style={{ height: "52px" }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-base font-semibold">{t("password")}</Label>
        <div className="relative">
          <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            defaultValue={signInDefaultValues.password}
            className="h-13 ps-11 text-base rounded-xl border-2 focus:border-primary"
            style={{ height: "52px" }}
          />
        </div>
      </div>

      {data && !data.success && data.message && (
        <div className="bg-destructive/10 text-destructive text-sm font-medium px-4 py-3 rounded-xl border border-destructive/20">
          {data.message}
        </div>
      )}

      <SignInButton />

      <p className="text-center text-base text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/sign-up" className="text-primary font-bold hover:underline">
          {t("signUpButton")}
        </Link>
      </p>
    </form>
  );
};

export default CredentialsSignInForm;
