"use server";

import { prisma } from "@/db/prisma";
import { revalidatePath } from "next/cache";

export async function getDealSettings() {
  const settings = await prisma.dealSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      isActive: false,
      endDate: new Date(),
      title: "صفقة الشهر",
    },
  });
  return settings;
}

export async function updateDealSettings(data: {
  isActive: boolean;
  endDate: string;
  productId?: string | null;
  title?: string;
}) {
  try {
    await prisma.dealSettings.upsert({
      where: { id: "default" },
      update: {
        isActive: data.isActive,
        endDate: new Date(data.endDate),
        productId: data.productId || null,
        title: data.title || "صفقة الشهر",
      },
      create: {
        id: "default",
        isActive: data.isActive,
        endDate: new Date(data.endDate),
        productId: data.productId || null,
        title: data.title || "صفقة الشهر",
      },
    });

    revalidatePath("/");
    revalidatePath("/ar");
    revalidatePath("/en");

    return { success: true, message: "تم حفظ إعدادات الصفقة بنجاح" };
  } catch {
    return { success: false, message: "حدث خطأ أثناء الحفظ" };
  }
}
