"use server";
import { cookies } from "next/headers";
import { prisma } from "@/db/prisma";
import { z } from "zod";
export async function recordStoreEvent(name: string, productId?: string) {
  const event = z.enum(["view_product", "view_upsell", "add_to_cart", "begin_checkout"]).parse(name);
  const sessionId = (await cookies()).get("sessionCartId")?.value;
  if (!sessionId || sessionId.length > 100) return;
  if (productId) z.string().uuid().parse(productId);
  await prisma.storeEvent.create({ data: { name: event, sessionId, productId } });
}
