import { Button } from "@/components/ui/button";
import { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Unauthorized Access",
};

export default async function UnauthorizedPage() {
  const t = await getTranslations('Unauthorized');
  return (
    <div className="container mx-auto flex h-[calc(100vh-200px)] flex-col items-center justify-center space-y-4">
      <h1 className="h1-bold text-4xl">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description')}
      </p>
      <Button asChild>
        <Link href="/">{t('returnHome')}</Link>
      </Button>
    </div>
  );
}
