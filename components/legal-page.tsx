import { ChevronRight, FileText, ShieldCheck } from "lucide-react";

import { Link } from "@/i18n/navigation";

type LegalSection = {
  title: string;
  body: string[];
};

type LegalPageProps = {
  badge: string;
  title: string;
  intro: string;
  lastUpdated: string;
  highlightsTitle: string;
  highlights: string[];
  sections: LegalSection[];
  contactTitle: string;
  contactText: string;
  contactCta: string;
  contactHref: string;
  variant: "privacy" | "terms";
};

const iconMap = {
  privacy: ShieldCheck,
  terms: FileText,
} as const;

export default function LegalPage({
  badge,
  title,
  intro,
  lastUpdated,
  highlightsTitle,
  highlights,
  sections,
  contactTitle,
  contactText,
  contactCta,
  contactHref,
  variant,
}: LegalPageProps) {
  const Icon = iconMap[variant];

  return (
    <section className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-[2rem] border bg-card shadow-sm">
        <div className="relative border-b bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-700 px-6 py-10 text-white sm:px-10 sm:py-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <span className="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
                {badge}
              </span>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                    {title}
                  </h1>
                </div>
                <p className="max-w-2xl text-sm leading-7 text-white/80 sm:text-base">
                  {intro}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/85 backdrop-blur">
              {lastUpdated}
            </div>
          </div>
        </div>

        <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[0.95fr_1.7fr]">
          <aside className="space-y-4">
            <div className="rounded-3xl border bg-muted/30 p-5">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {highlightsTitle}
              </h2>
              <ul className="mt-4 space-y-3">
                {highlights.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl bg-background px-4 py-3 text-sm leading-6 text-foreground/90"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border bg-background p-5">
              <h2 className="text-lg font-bold">{contactTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {contactText}
              </p>
              <Link
                href={contactHref}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
              >
                {contactCta}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>

          <div className="space-y-4">
            {sections.map((section) => (
              <article
                key={section.title}
                className="rounded-3xl border bg-background p-5 sm:p-6"
              >
                <h2 className="text-xl font-bold tracking-tight">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-[15px]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
