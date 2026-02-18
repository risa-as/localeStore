
import { Metadata } from "next";
import CreateUserForm from "./create-user-form";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
    title: "Create User",
};

const AdminUserCreatePage = async () => {
    const t = await getTranslations('Admin');
    return (
        <div className="space-y-8 max-w-lg mx-auto">
            <h1 className="h2-bold">{t('User.create')}</h1>
            <CreateUserForm />
        </div>
    );
};

export default AdminUserCreatePage;
