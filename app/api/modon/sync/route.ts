import { NextResponse } from "next/server";
import { syncModonOrders } from "@/lib/actions/order.actions";

export const maxDuration = 60; // 60 seconds limit
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
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
