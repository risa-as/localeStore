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
        <div className="space-y-2 border p-4 rounded-md">
          <h3 className="font-semibold text-lg pb-2">{t('shippingAddress')}</h3>
          <div className="grid grid-cols-1 gap-1">
            <p><span className="font-medium">{t('fullName')}: </span>{defaultValues.fullName}</p>
            <p><span className="font-medium">{t('phoneNumber')}: </span>{defaultValues.phoneNumber}</p>
            <p><span className="font-medium">{t('governorate')}: </span>{defaultValues.governorate}</p>
            <p><span className="font-medium">{t('address')}: </span>{defaultValues.address}</p>
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
