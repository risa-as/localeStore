import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import { signOutUser } from "@/lib/actions/user.actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserIcon, LogOut, ShoppingBag, User, LayoutDashboard } from "lucide-react";
import { getTranslations } from "next-intl/server";

const UserButton = async () => {
  const session = await auth();
  const tHeader = await getTranslations("Header");

  if (!session) {
    return (
      <Button asChild className="gap-2 font-bold rounded-xl h-10">
        <Link href="/sign-in">
          <UserIcon className="w-4 h-4" />
          {tHeader("signIn")}
        </Link>
      </Button>
    );
  }

  const firstInitial = session.user?.name?.charAt(0).toUpperCase() ?? "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-base hover:bg-primary/20 border-2 border-primary/20"
        >
          {firstInitial}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
        {/* Name + email */}
        <DropdownMenuLabel>
          <p className="font-bold text-sm">{session.user?.name}</p>
          <p className="font-normal text-xs text-muted-foreground truncate mt-0.5">
            {session.user?.email}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <Link href="/user/profile" className="flex items-center gap-2 w-full">
            <User className="w-4 h-4" />
            {tHeader("profile")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem>
          <Link href="/user/orders" className="flex items-center gap-2 w-full">
            <ShoppingBag className="w-4 h-4" />
            {tHeader("orderHistory")}
          </Link>
        </DropdownMenuItem>

        {(session?.user?.role === "admin" || session?.user?.role === "employee") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/admin/overview" className="flex items-center gap-2 w-full">
                <LayoutDashboard className="w-4 h-4" />
                {tHeader("admin")}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem className="p-0">
          <form action={signOutUser} className="w-full">
            <button
              type="submit"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {tHeader("signOut")}
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserButton;
