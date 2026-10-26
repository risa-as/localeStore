import { auth } from "@/auth";
import { prisma } from "@/db/prisma";

/** Check current DB role as well as the session, so revocation is immediate. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("غير مصرح — يرجى تسجيل الدخول");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (!user || user.role === "disabled") throw new Error("غير مصرح");
  return { ...session, user: { ...session.user, id: user.id, role: user.role } };
}

export async function requireStaff() {
  const session = await requireUser();
  if (!["admin", "employee"].includes(session.user.role)) throw new Error("غير مصرح");
  return session;
}

export async function requireAdministrator() {
  const session = await requireUser();
  if (session.user.role !== "admin") throw new Error("غير مصرح");
  return session;
}
