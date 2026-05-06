import Image from "next/image";
import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { APP_NAME } from "@/lib/constants";
import { getLogoUrl } from "@/lib/get-logo";

const Footer = async () => {
  const currentYear = new Date().getFullYear();
  const t = await getTranslations("Footer");
  const logoUrl = await getLogoUrl();

  return (
    <footer className="relative mt-8 overflow-hidden border-t border-border/60 bg-card sm:mt-14">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="absolute -left-20 top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -right-20 bottom-6 h-40 w-40 rounded-full bg-zinc-500/10 blur-3xl" />

      <div className="container relative mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-background via-background to-muted/30 p-5 shadow-sm shadow-black/5 sm:p-6 lg:p-7">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_1.85fr] lg:items-start lg:gap-8">
            <div className="space-y-4">
              <Link href="/" className="inline-flex items-center gap-3">
                <div className="rounded-2xl border border-border/60 bg-background/80 p-2 shadow-sm">
                  <Image
                    src={logoUrl}
                    alt={APP_NAME}
                    width={44}
                    height={44}
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <span className="block text-xl font-black tracking-tight sm:text-2xl">
                    {APP_NAME}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
                    Storefront
                  </span>
                </div>
              </Link>

              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                {t("description")}
              </p>

              <div className="inline-flex max-w-full items-center gap-3 rounded-2xl border border-primary/15 bg-primary/[0.06] px-3.5 py-3">
                <div className="rounded-xl bg-background p-2 text-primary shadow-sm">
                    <MapPin className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/80">
                    Location
                  </p>
                  <p className="truncate text-sm font-medium text-foreground">
                    {t("country")}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur-sm">
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-primary">
                  {t("quickLinks")}
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {[
                    { href: "/search", label: t("allProducts") },
                    { href: "/cart", label: t("cart") },
                    { href: "/user/orders", label: t("myOrders") },
                  ].map(({ href, label }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="group inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span className="mr-2.5 h-px w-3 bg-border transition-all group-hover:w-5 group-hover:bg-primary" />
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur-sm">
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-primary">
                  {t("support")}
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {[
                    { href: "/sign-in", label: t("signIn") },
                    { href: "/sign-up", label: t("signUp") },
                  ].map(({ href, label }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="group inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span className="mr-2.5 h-px w-3 bg-border transition-all group-hover:w-5 group-hover:bg-primary" />
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur-sm sm:col-span-2 xl:col-span-1">
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-primary">
                  {t("legal")}
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {[
                    { href: "/privacy-policy", label: t("privacyPolicy") },
                    { href: "/terms-of-service", label: t("termsOfService") },
                  ].map(({ href, label }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="group inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span className="mr-2.5 h-px w-3 bg-border transition-all group-hover:w-5 group-hover:bg-primary" />
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2.5 border-t border-border/60 pt-4 text-sm text-muted-foreground sm:mt-7 sm:flex-row sm:items-center sm:justify-between">
            <span>
              &copy; {currentYear} {APP_NAME}. {t("copyright")}
            </span>
            <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium sm:text-sm">
              {t("poweredBy")}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
