import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  primeFetchStates,
  primeFetchSystemSteps,
  primeFetchMerchantShops,
} from "@/lib/delivery/providers/prime";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * يطبع ردود برايم الخام (الولايات، الحالات، عيّنة بحث) لاكتشاف أشكالها
 * وملء PRIME_STATE_MAP / PRIME_STATUS_MAP وتثبيت أسماء الحقول. أدمن فقط.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const isCron =
    process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const session = isCron ? null : await auth();
  if (!isCron && session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [states, steps, merchantShops] = await Promise.allSettled([
    primeFetchStates(),
    primeFetchSystemSteps(),
    primeFetchMerchantShops(),
  ]);

  const unwrap = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled"
      ? r.value
      : { error: (r.reason as Error)?.message ?? String(r.reason) };

  return NextResponse.json({
    states: unwrap(states),
    systemSteps: unwrap(steps),
    merchantShops: unwrap(merchantShops),
  });
}
