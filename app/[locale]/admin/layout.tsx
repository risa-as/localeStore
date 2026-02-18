import { APP_NAME } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";
import Menu from "@/components/shared/header/menu";
import MainNav from "./main-nav";
import { getMessages, getLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { auth } from "@/auth";


export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();
  const locale = await getLocale();
  const session = await auth();

  return (
    <div className="flex flex-col">
      <div className="border-b container mx-auto">
        <div className="flex items-center h-16 px-4">
          <Link href="/" className="w-22">
            <Image
              src="/images/logo.svg"
              alt={APP_NAME}
              width={48}
              height={48}
            />
          </Link>
          <MainNav className="ms-6" role={session?.user?.role} />
          <div className="ms-auto items-center flex gap-4">
            <NextIntlClientProvider locale={locale} messages={messages}>
              <Menu />
            </NextIntlClientProvider>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 container mx-auto">
        {children}
      </div>
    </div>
  );
}
