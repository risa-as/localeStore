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
import { createUser } from "@/lib/actions/user.actions";
import { USER_ROLES } from "@/lib/constants";
import { signUpFormSchema } from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

const formSchema = signUpFormSchema.extend({
  role: z.string().min(1, "Role is required"),
});

const CreateUserForm = () => {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("Admin");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", role: "user" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const res = await createUser(values);
      if (!res.success) return toast({ variant: "destructive", description: res.message });
      toast({ description: res.message });
      router.push("/admin/users");
    } catch (error) {
      toast({ variant: "destructive", description: (error as Error).message });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("User.name")}</FormLabel>
              <FormControl><Input placeholder={t("User.enterName")} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("User.email")}</FormLabel>
              <FormControl><Input placeholder={t("User.enterEmail")} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("User.password")}</FormLabel>
              <FormControl><Input type="password" placeholder={t("User.enterPassword")} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="confirmPassword" render={({ field }) => (
            <FormItem>
              <FormLabel>{t("User.confirmPassword")}</FormLabel>
              <FormControl><Input type="password" placeholder={t("User.confirmPasswordPlaceholder")} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="role" render={({ field }) => (
          <FormItem>
            <FormLabel>{t("User.role")}</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger><SelectValue placeholder={t("User.selectRole")} /></SelectTrigger>
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
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("User.creating")}</>
              : t("User.submit")}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CreateUserForm;
