import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/authorization";

export async function requireAdmin() {
  try {
    return await requireStaff();
  } catch {
    redirect("/unauthorized");
  }
}
