import { prisma } from "@/db/prisma";
import { cache } from "react";

export const getLogoUrl = cache(async (): Promise<string> => {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: "default" },
      select: { logoUrl: true },
    });
    return settings?.logoUrl ?? "/images/logo.svg";
  } catch {
    return "/images/logo.svg";
  }
});
