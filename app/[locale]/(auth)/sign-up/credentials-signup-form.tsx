"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpDefaultValues } from "@/lib/constants";
import { Link } from "@/i18n/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUpUser } from "@/lib/actions/user.actions";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, User, Mail, Lock } from "lucide-react";

interface FormState {
  success: boolean;
  fieldErrors?: Record<string, string[]>;
  formError: string;
}

const CredentialsSignUpForm = () => {
  const t = useTranslations("Auth");
  const [state, action] = useActionState(signUpUser, {
    success: false,
    fieldErrors: {},
    formError: "",
  } as FormState);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const SignUpButton = () => {
    const { pending } = useFormStatus();
    return (
      <Button
        disabled={pending}
        className="w-full h-14 text-base font-bold rounded-2xl gap-2 shadow-lg shadow-primary/20"
      >
        {pending && <Loader2 className="w-5 h-5 animate-spin" />}
        {pending ? t("submittingButton") : t("signUpButton")}
      </Button>
    );
  };

  const fieldClass = "h-13 ps-11 text-base rounded-xl border-2 focus:border-primary";
  const style = { height: "52px" };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name" className="text-base font-semibold">{t("name")}</Label>
        <div className="relative">
          <User className="absolute start-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input id="name" name="name" type="text" autoComplete="name"
            defaultValue={signUpDefaultValues.name} className={fieldClass} style={style} />
        </div>
        {state.fieldErrors?.name && <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>}
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-base font-semibold">{t("email")}</Label>
        <div className="relative">
          <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input id="email" name="email" type="email" autoComplete="email"
            defaultValue={signUpDefaultValues.email} className={fieldClass} style={style} />
        </div>
        {state.fieldErrors?.email && <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <Label htmlFor="password" className="text-base font-semibold">{t("password")}</Label>
        <div className="relative">
          <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input id="password" name="password" type="password" autoComplete="new-password"
            defaultValue={signUpDefaultValues.password} className={fieldClass} style={style} />
        </div>
        {state.fieldErrors?.password && <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>}
      </div>

      {/* Confirm password */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-base font-semibold">{t("confirmPassword")}</Label>
        <div className="relative">
          <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password"
            defaultValue={signUpDefaultValues.confirmPassword} className={fieldClass} style={style} />
        </div>
        {state.fieldErrors?.confirmPassword && <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword[0]}</p>}
      </div>

      {state.formError && (
        <div className="bg-destructive/10 text-destructive text-sm font-medium px-4 py-3 rounded-xl border border-destructive/20">
          {state.formError}
        </div>
      )}

      <SignUpButton />

      <p className="text-center text-base text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link href="/sign-in" className="text-primary font-bold hover:underline">
          {t("signInButton")}
        </Link>
      </p>
    </form>
  );
};

export default CredentialsSignUpForm;
