"use server";
import { requireAdministrator } from "@/lib/authorization";

import { prisma } from "@/db/prisma";
import { revalidatePath } from "next/cache";

export async function getSiteSettings() {
  const settings = await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", logoUrl: "/images/logo.svg" },
  });
  return settings;
}

export async function updateLogoUrl(logoUrl: string) {
  await requireAdministrator();
  try {
    await prisma.siteSettings.upsert({
      where: { id: "default" },
      update: { logoUrl },
      create: { id: "default", logoUrl },
    });

    revalidatePath("/", "layout");

    return { success: true, message: "تم تحديث اللوغو بنجاح" };
  } catch {
    return { success: false, message: "حدث خطأ أثناء الحفظ" };
  }
}
