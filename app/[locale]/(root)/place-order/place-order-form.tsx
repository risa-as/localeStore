"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { createOrder } from "@/lib/actions/order.actions";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { insertOrderSchema } from "@/lib/validators";
import { Input } from "@/components/ui/input";
import { iraqGovernorates } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const t = useTranslations('Checkout');
  const tGov = useTranslations('Governorates');
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
      quantity: (defaultValues.quantity || cart.items.reduce((a: any, c: any) => a + c.qty, 0)) as number,
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
    <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4">
      {isEditable ? (
        <>
          <div>
            <label className="block text-sm font-medium">{t('fullName')}</label>
            <Input {...register("fullName")} placeholder={t('fullName')} />
            {errors.fullName && <p className="text-red-500 text-sm">{errors.fullName.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium">{t('phoneNumber')}</label>
            <Input {...register("phoneNumber")} placeholder={t('phoneNumber')} />
            {errors.phoneNumber && <p className="text-red-500 text-sm">{errors.phoneNumber.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium">{t('governorate')}</label>
            <Select onValueChange={(value) => setValue("governorate", value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('governorate')} />
              </SelectTrigger>
              <SelectContent>
                {iraqGovernorates.map((gov) => (
                  <SelectItem key={gov} value={gov}>
                    {tGov(gov) || gov}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.governorate && <p className="text-red-500 text-sm">{errors.governorate.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium">{t('address')}</label>
            <Input {...register("address")} placeholder={t('address')} />
            {errors.address && <p className="text-red-500 text-sm">{errors.address.message}</p>}
          </div>
        </>
      ) : (
        <div className="bg-muted/40 p-5 rounded-lg border space-y-4">
          <h3 className="font-bold text-lg border-b pb-3">{t('shippingAddress')}</h3>
          <div className="grid gap-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-muted-foreground">{t('fullName')}</span>
              <span className="font-medium">{defaultValues.fullName}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-muted-foreground">{t('phoneNumber')}</span>
              <span className="font-medium dir-ltr text-right">{defaultValues.phoneNumber}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-muted-foreground">{t('governorate')}</span>
              <span className="font-medium">{tGov(defaultValues.governorate as any) || defaultValues.governorate}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-muted-foreground">{t('address')}</span>
              <span className="font-medium">{defaultValues.address}</span>
            </div>
          </div>
          {/* Hidden inputs to ensure form submission works */}
          <input type="hidden" {...register("fullName")} value={defaultValues.fullName} />
          <input type="hidden" {...register("phoneNumber")} value={defaultValues.phoneNumber} />
          <input type="hidden" {...register("governorate")} value={defaultValues.governorate} />
          <input type="hidden" {...register("address")} value={defaultValues.address} />
        </div>
      )}

      <Button disabled={loading} className="w-full">
        {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{" "}
        {t('placeOrderButton')}
      </Button>
    </form>
  );
};

export default PlaceOrderForm;
