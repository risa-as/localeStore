"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrder } from "@/lib/actions/order.actions";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { insertOrderSchema } from "@/lib/validators";
import { iraqGovernorates } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const inputStyle = { height: "52px" };
const inputClass = "h-13 text-base rounded-xl border-2 focus:border-primary";

const PlaceOrderForm = ({
  cart,
  defaultValues,
  isEditable = true,
}: {
  cart: any;
  defaultValues: Partial<z.infer<typeof insertOrderSchema>>;
  isEditable?: boolean;
}) => {
  const router = useRouter();
  const t = useTranslations("Checkout");
  const tGov = useTranslations("Governorates");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<z.infer<typeof insertOrderSchema>>({
    resolver: zodResolver(insertOrderSchema) as any,
    defaultValues: {
      fullName: defaultValues.fullName || "",
      phoneNumber: defaultValues.phoneNumber || "",
      governorate: defaultValues.governorate || "",
      address: defaultValues.address || "",
      quantity: (defaultValues.quantity ||
        cart.items.reduce((a: any, c: any) => a + c.qty, 0)) as number,
    },
  });

  const onSubmit = async (values: z.infer<typeof insertOrderSchema>) => {
    setLoading(true);
    const res = await createOrder(values);
    setLoading(false);
    if (res.success && res.redirectTo) {
      if (res.redirectTo.startsWith("http")) {
        window.location.href = res.redirectTo;
      } else {
        router.push(res.redirectTo);
      }
    } else {
      alert(res.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {isEditable ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">{t("fullName")}</Label>
            <Input
              {...register("fullName")}
              placeholder={t("fullName")}
              className={inputClass}
              style={inputStyle}
            />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-base font-semibold">{t("phoneNumber")}</Label>
            <Input
              {...register("phoneNumber")}
              placeholder={t("phoneNumber")}
              type="tel"
              className={inputClass}
              style={inputStyle}
              dir="ltr"
            />
            {errors.phoneNumber && <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-base font-semibold">{t("governorate")}</Label>
            <Select onValueChange={(v) => setValue("governorate", v)}
              defaultValue={defaultValues.governorate || ""}>
              <SelectTrigger className={`${inputClass} w-full`} style={inputStyle}>
                <SelectValue placeholder={t("governorate")} />
              </SelectTrigger>
              <SelectContent>
                {iraqGovernorates.map((gov) => (
                  <SelectItem key={gov} value={gov} className="text-base py-2.5">
                    {tGov(gov as any) || gov}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.governorate && <p className="text-sm text-destructive">{errors.governorate.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-base font-semibold">{t("address")}</Label>
            <Input
              {...register("address")}
              placeholder={t("address")}
              className={inputClass}
              style={inputStyle}
            />
            {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
          </div>
        </>
      ) : (
        <div className="bg-muted/40 p-4 rounded-2xl border-2 space-y-2.5">
          {[
            { label: t("fullName"), val: defaultValues.fullName },
            { label: t("phoneNumber"), val: defaultValues.phoneNumber },
            { label: t("governorate"), val: tGov(defaultValues.governorate as any) || defaultValues.governorate },
            { label: t("address"), val: defaultValues.address },
          ].map(({ label, val }) => (
            <div key={label} className="flex justify-between gap-2 text-base">
              <span className="text-muted-foreground shrink-0">{label}</span>
              <span className="font-semibold text-end">{val}</span>
            </div>
          ))}
          <input type="hidden" {...register("fullName")} value={defaultValues.fullName} />
          <input type="hidden" {...register("phoneNumber")} value={defaultValues.phoneNumber} />
          <input type="hidden" {...register("governorate")} value={defaultValues.governorate} />
          <input type="hidden" {...register("address")} value={defaultValues.address} />
        </div>
      )}

      <Button
        disabled={loading}
        className="w-full h-14 text-base font-extrabold rounded-2xl gap-2 shadow-lg shadow-primary/20"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        {t("placeOrderButton")}
      </Button>
    </form>
  );
};

export default PlaceOrderForm;
