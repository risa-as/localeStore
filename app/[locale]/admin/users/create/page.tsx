import { Metadata } from "next";
import CreateUserForm from "./create-user-form";
import Link from "next/link";
import { ArrowRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "إضافة مستخدم" };

const AdminUserCreatePage = async () => {
  const t = await getTranslations("Admin");
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/users"><ArrowRight className="w-4 h-4" /></Link>
        </Button>
        <div className="p-2 rounded-lg bg-primary/10">
          <UserPlus className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("User.create")}</h1>
          <p className="text-sm text-muted-foreground">أضف مستخدماً جديداً للنظام</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <p className="text-sm font-medium">بيانات المستخدم</p>
        </div>
        <div className="p-6">
          <CreateUserForm />
        </div>
      </div>
    </div>
  );
};

export default AdminUserCreatePage;
