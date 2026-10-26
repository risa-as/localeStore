"use server";

import { prisma } from "@/db/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdministrator } from "@/lib/authorization";

const updateShippingSettingsSchema = z.object({
  baghdadCost: z.coerce.number().positive(),
  othersCost: z.coerce.number().positive(),
});

// Always returns the single settings record, creating it if it doesn't exist
export async function getShippingSettings() {
  return prisma.shippingSettings.upsert({
    where: { id: "default" },
    create: { id: "default", baghdadCost: 4, othersCost: 5 },
    update: {},
  });
}

export async function updateShippingSettings(data: { baghdadCost: number; othersCost: number }) {
  await requireAdministrator();
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return { success: false, message: "Unauthorized" };
  }

  const parsed = updateShippingSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, message: "Invalid values" };
  }

  await prisma.shippingSettings.upsert({
    where: { id: "default" },
    create: { id: "default", baghdadCost: parsed.data.baghdadCost, othersCost: parsed.data.othersCost },
    update: { baghdadCost: parsed.data.baghdadCost, othersCost: parsed.data.othersCost },
  });

  revalidatePath("/admin/shipping-settings");
  return { success: true, message: "تم تحديث أسعار التوصيل بنجاح" };
}
