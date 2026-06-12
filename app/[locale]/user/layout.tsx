import { auth } from "@/auth";
import { APP_NAME } from "@/lib/constants";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Menu from "@/components/shared/header/menu";
import { getLogoUrl } from "@/lib/get-logo";
import MainNav from "./main-nav";

export default async function UserLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  const logoUrl = await getLogoUrl();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b-2 bg-card/95 backdrop-blur">
        <div className="h-1 bg-gradient-to-r from-primary to-orange-300" />
        <div className="container mx-auto px-3 sm:px-6">
          <div className="flex items-center h-14 sm:h-16 gap-3">
            <Link href="/" className="shrink-0">
              <Image src={logoUrl} alt={APP_NAME} width={38} height={38} className="rounded-xl" />
            </Link>
            <MainNav />
            <div className="ml-auto">
              <Menu />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-3 sm:px-6 py-5 sm:py-8">
        {children}
      </main>
    </div>
  );
}
