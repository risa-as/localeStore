import { deleteUser, getAllUsers } from "@/lib/actions/user.actions";
import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Users, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth-guard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DeleteDialog from "@/components/shared/delete-dialog";
import Pagination from "@/components/shared/pagination";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "المستخدمون" };

const AdminUserPage = async (props: {
  searchParams: Promise<{ page: string; query: string }>;
}) => {
  const { page = "1", query: searchText } = await props.searchParams;
  const session = await requireAdmin();
  if (session?.user?.role !== "admin") redirect("/unauthorized");

  const users = await getAllUsers({
    page: Number(page),
    query: searchText,
    limit: 20,
  });
  const t = await getTranslations("Admin");

  const roleConfig: Record<
    string,
    { label: string; variant: "default" | "secondary" | "outline" }
  > = {
    admin: { label: t("admin"), variant: "default" },
    employee: { label: t("employee"), variant: "outline" },
    user: { label: t("user"), variant: "secondary" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("users")}</h1>
            <p className="text-sm text-muted-foreground">
              {users.data.length} مستخدم في هذه الصفحة
            </p>
          </div>
          {searchText && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{searchText}</Badge>
              <Link href="/admin/users">
                <Button variant="outline" size="sm">
                  {t("removeFilter")}
                </Button>
              </Link>
            </div>
          )}
        </div>
        <Button asChild>
          <Link href="/admin/users/create" className="gap-2">
            <Plus className="w-4 h-4" />
            {t("createUser")}
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold w-12">#</TableHead>
              <TableHead className="font-semibold">{t("name")}</TableHead>
              <TableHead className="font-semibold">{t("email")}</TableHead>
              <TableHead className="font-semibold">{t("role")}</TableHead>
              <TableHead className="text-center font-semibold w-[100px]">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.data.map((user: any, index: number) => {
              const cfg = roleConfig[user.role] ?? {
                label: user.role,
                variant: "secondary" as const,
              };
              return (
                <TableRow key={user.id} className="hover:bg-muted/30">
                  <TableCell className="text-muted-foreground text-sm">
                    {(Number(page) - 1) * 20 + index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title={t("edit")}
                      >
                        <Link href={`/admin/users/${user.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Link>
                      </Button>
                      <DeleteDialog id={user.id} action={deleteUser} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {users.totalPages > 1 && (
        <Pagination
          page={Number(page) || 1}
          totalPages={users.totalPages}
          urlParamName="page"
        />
      )}
    </div>
  );
};

export default AdminUserPage;
