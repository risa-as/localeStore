import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { syncSpendForDate, yesterdayBaghdad } from "@/lib/meta/adspend";

/**
 * مزامنة يومية لصرف الإعلانات (يوم أمس بتوقيت بغداد) — تُجدول من Vercel Cron.
 * محمي بمتغير البيئة CRON_SECRET عبر ترويسة Authorization: Bearer <secret>
 * أو ?secret=<secret> (احتياطاً).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET غير مضبوط في متغيرات البيئة" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  const provided =
    authHeader.replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("secret") || "";
  if (provided !== secret) {
    return NextResponse.json({ ok: false, message: "غير مصرّح" }, { status: 401 });
  }

  const conn = await prisma.metaConnection.findUnique({ where: { id: "default" } });
  if (!conn?.userAccessToken) {
    return NextResponse.json({ ok: false, message: "لا يوجد اتصال بـ Meta" }, { status: 200 });
  }

  const result = await syncSpendForDate(conn.userAccessToken, yesterdayBaghdad());
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
