import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

// --- Rate Limiting ---
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 150;

// Routes exempt from rate limiting (Stripe webhooks must always pass through)
const RATE_LIMIT_EXEMPT = ["/api/webhooks/"];

function isRateLimited(req: NextRequest): boolean {
  const pathname = req.nextUrl.pathname;
  if (RATE_LIMIT_EXEMPT.some((p) => pathname.startsWith(p))) return false;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "0.0.0.0";

  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.windowStart > WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    return true;
  }
  return false;
}
// --- End Rate Limiting ---

export const config = {
  // Skip all paths that should not be internationalized
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

export default NextAuth(authConfig).auth((req) => {
  if (isRateLimited(req)) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  const response = intlMiddleware(req);

  // Check for session cart cookie
  if (!req.cookies.get("sessionCartId")) {
    const sessionCartId = crypto.randomUUID();
    response.cookies.set("sessionCartId", sessionCartId);
  }

  return response;
});
