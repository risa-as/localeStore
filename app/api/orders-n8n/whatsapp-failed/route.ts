import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";

export async function POST(req: Request) {
  const body = await req.json();
  const { phone, status, messageId, errorCode } = body;

  await prisma.whatsAppFailedDelivery.create({
    data: {
      phone,
      status,
      messageId,
      errorCode: errorCode?.toString(),
    },
  });
  return NextResponse.json({ success: true });
}

export async function GET() {
  const failed = await prisma.whatsAppFailedDelivery.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(failed);
}
