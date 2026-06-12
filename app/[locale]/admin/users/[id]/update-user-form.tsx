"use client";

import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateUser } from "@/lib/actions/user.actions";
import { USER_ROLES } from "@/lib/constants";
import { updateUserSchema } from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

const UpdateUserForm = ({ user }: { user: z.infer<typeof updateUserSchema> }) => {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("Admin");

  const form = useForm<z.infer<typeof updateUserSchema>>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: user,
  });

  const onSubmit = async (values: z.infer<typeof updateUserSchema>) => {
    try {
      const res = await updateUser({ ...values, id: user.id });
      if (!res.success) return toast({ variant: "destructive", description: res.message });
      toast({ description: res.message });
      form.reset();
      router.push("/admin/users");
    } catch (error) {
      toast({ variant: "destructive", description: (error as Error).message });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("User.email")}</FormLabel>
            <FormControl>
              <Input disabled placeholder="البريد الإلكتروني" {...field}
                className="bg-muted/40 cursor-not-allowed" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("User.name")}</FormLabel>
            <FormControl><Input placeholder="اسم المستخدم" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="role" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("User.role")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value.toString()}>
              <FormControl>
                <SelectTrigger><SelectValue placeholder="اختر الصلاحية" /></SelectTrigger>
              </FormControl>
              <SelectContent>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>{t(role)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting} className="min-w-[140px]">
            {form.formState.isSubmitting
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />جاري الحفظ...</>
              : "حفظ التعديلات"}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default UpdateUserForm;
