import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requireUser } from "@/lib/authorization";

function signature(value: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for order access");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export async function grantOrderAccess(orderId: string) {
  const value = `${orderId}.${Date.now() + 30 * 86400000}`;
  (await cookies()).set(`order-access-${orderId}`, `${value}.${signature(value)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 30 * 86400,
  });
}

export async function hasOrderAccess(order: { id: string; userId: string | null }) {
  const session = await auth();
  if (session?.user?.id) {
    try {
      const current = await requireUser();
      if (["admin", "employee"].includes(current.user.role) || current.user.id === order.userId) return true;
    } catch { /* A revoked account cannot access orders through its old session. */ }
  }
  const token = (await cookies()).get(`order-access-${order.id}`)?.value;
  if (!token) return false;
  const [id, expires, mac] = token.split(".");
  if (id !== order.id || !Number.isFinite(Number(expires)) || Number(expires) < Date.now() || !mac) return false;
  const expected = Buffer.from(signature(`${id}.${expires}`));
  const actual = Buffer.from(mac);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function assertOrderAccess(order: { id: string; userId: string | null } | null) {
  if (!order || !(await hasOrderAccess(order))) throw new Error("الطلب غير متاح؛ افتحه من الجهاز الذي أرسلت الطلب منه أو سجّل الدخول إلى حسابك");
}
