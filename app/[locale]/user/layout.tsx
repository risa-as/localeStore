import { auth } from "@/auth";
import { APP_NAME } from "@/lib/constants";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Menu from "@/components/shared/header/menu";
import MainNav from "./main-nav";

export default async function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }

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
          <MainNav className="ml-6" />
          <div className="ml-auto items-center flex space-x-4">
            <Menu />
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-4 p-8 pt-6 container mx-auto">
        {children}
      </div>
    </div>
  );
}
