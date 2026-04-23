import { NextResponse } from "next/server";
import { syncModonOrders } from "@/lib/actions/order.actions";
import { auth } from "@/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const session = isCron ? null : await auth();
    const isAdmin = session?.user?.role === "admin";

    if (!isCron && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await syncModonOrders();

    return NextResponse.json({
      success: true,
      message: res.message,
      updated: res.updatedOrders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
