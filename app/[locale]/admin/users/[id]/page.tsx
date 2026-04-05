import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUserById } from "@/lib/actions/user.actions";
import UpdateUserForm from "./update-user-form";
import Link from "next/link";
import { ArrowRight, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "تعديل المستخدم" };

const AdminUserUpdatePage = async (props: { params: Promise<{ id: string }> }) => {
  const { id } = await props.params;
  const user = await getUserById(id);
  if (!user) notFound();

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/users"><ArrowRight className="w-4 h-4" /></Link>
        </Button>
        <div className="p-2 rounded-lg bg-primary/10">
          <UserCog className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">تعديل مستخدم</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <p className="text-sm font-medium">بيانات المستخدم</p>
        </div>
        <div className="p-6">
          <UpdateUserForm user={user} />
        </div>
      </div>
    </div>
  );
};

export default AdminUserUpdatePage;
