import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const token = process.env.MODON_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" }, { status: 500 });

  const res = await fetch(
    `https://mcht.modon-express.net/v1/merchant/merchant-orders?token=${token}`,
    { cache: "no-store" },
  );
  const data = await res.json();
  const orders: any[] = Array.isArray(data) ? data : (data?.data ?? []);

  // أظهر جميع حقول أول 2 طلبات كاملةً
  return NextResponse.json({
    total: orders.length,
    sample: orders.slice(0, 2),
  });
}
