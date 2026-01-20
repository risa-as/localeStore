import { deleteUser, getAllUsers } from "@/lib/actions/user.actions";
import { Metadata } from "next";
import { formatId } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil } from "lucide-react";
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
import DeleteDialog from "@/components/shared/delete-dialog";
import Pagination from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Admin User",
};

const AdminUserPage = async (props: {
  searchParams: Promise<{
    page: string;
    query: string;
  }>;
}) => {
  const { page = "1", query: searchText } = await props.searchParams;
  const session = await requireAdmin();
  if (session?.user?.role !== "admin") redirect("/unauthorized");
  const users = await getAllUsers({
    page: Number(page),
    query: searchText,
    limit: 20,
  });

  const t = await getTranslations('Admin');

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between  gap-3">
          <h1 className="h2-bold">{t('users')}</h1>
          <Button asChild variant="default">
            <Link href="/admin/users/create">
              {t('createUser')}
            </Link>
          </Button>
          {searchText && (
            <div>
              {t('filteredBy')} <i>&quot;{searchText}&quot;</i>{" "}
              <Link href="/admin/orders">
                <Button variant={"outline"} size="sm">
                  {t('removeFilter')}
                </Button>
              </Link>
            </div>
          )}
        </div>{" "}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('id')}</TableHead>
                <TableHead>{t('name')}</TableHead>
                <TableHead>{t('email')}</TableHead>
                <TableHead>{t('role')}</TableHead>
                <TableHead className="w-[100px]">{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((user: any) => (
                <TableRow key={user.id}>
                  <TableCell>{formatId(user.id)}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.role === "user" ? (
                      <Badge variant={"secondary"}>{t('user')}</Badge>
                    ) : user.role === "admin" ? (
                      <Badge variant={"default"}>{t('admin')}</Badge>
                    ) : (
                      <Badge variant={"default"}>{t(user.role)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link href={`/admin/users/${user.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Link>
                      </Button>
                      <DeleteDialog id={user.id} action={deleteUser} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.totalPages > 1 && (
            <Pagination
              page={Number(page) || 1}
              totalPages={users.totalPages}
              urlParamName="page"
            />
          )}
        </div>
      </div>
    </>
  );
};

export default AdminUserPage;
