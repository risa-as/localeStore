import { APP_NAME } from "@/lib/constants";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { getLogoUrl } from "@/lib/get-logo";

const Footer = async () => {
  const currentYear = new Date().getFullYear();
  const t = await getTranslations("Footer");
  const logoUrl = await getLogoUrl();

  return (
    <footer className="border-t-2 bg-card mt-8 sm:mt-14">
      {/* Orange accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-zinc-800 via-zinc-600 to-zinc-400" />

      <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src={logoUrl}
                alt={APP_NAME}
                width={44}
                height={44}
                className="rounded-xl"
              />
              <span className="font-extrabold text-xl">{APP_NAME}</span>
            </Link>
            <p className="text-base text-muted-foreground leading-relaxed">
              {t("description")}
            </p>
          </div>

          {/* Quick links */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-base uppercase tracking-wider text-primary">
              {t("quickLinks")}
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: "/search", label: t("allProducts") },
                { href: "/cart", label: t("cart") },
                { href: "/user/orders", label: t("myOrders") },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-base text-muted-foreground hover:text-primary transition-colors font-medium"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-base uppercase tracking-wider text-primary">
              {t("support")}
            </h3>
            <ul className="space-y-2.5">
              {[
                { href: "/sign-in", label: t("signIn") },
                { href: "/sign-up", label: t("signUp") },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-base text-muted-foreground hover:text-primary transition-colors font-medium"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact placeholder */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-base uppercase tracking-wider text-primary">
              تواصل معنا
            </h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-2.5 text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="text-base">العراق</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t-2 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm sm:text-base text-muted-foreground">
          <span>
            &copy; {currentYear} {APP_NAME}. {t("copyright")}
          </span>
          <span className="text-xs sm:text-sm">Powered by Risa_03❤️</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
