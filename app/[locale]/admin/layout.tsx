import { APP_NAME } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";
import Menu from "@/components/shared/header/menu";
import MainNav from "./main-nav";
import { getLogoUrl } from "@/lib/get-logo";
import { auth } from "@/auth";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const logoUrl = await getLogoUrl();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="container mx-auto">
          <div className="flex items-center h-14 px-4 gap-4">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src={logoUrl}
                alt={APP_NAME}
                width={36}
                height={36}
                className="rounded-lg"
              />
              <span className="font-bold text-sm hidden sm:block text-foreground/80">
                {APP_NAME}
              </span>
            </Link>

            {/* Divider */}
            <div className="h-5 w-px bg-border shrink-0" />

            {/* Nav */}
            <div className="flex-1 overflow-hidden">
              <MainNav role={session?.user?.role} />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 shrink-0">
              <Menu />
            </div>

          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 container mx-auto p-4 md:p-8 pt-6">
        {children}
      </main>
    </div>
  );
}
