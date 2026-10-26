jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/authorization", () => ({ requireUser: jest.fn() }));
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { grantOrderAccess, hasOrderAccess } from "./access";

it("accepts the issued cookie and rejects a changed order identifier or signature", async () => {
  process.env.AUTH_SECRET = "isolated-order-access-test-secret";
  (auth as jest.Mock).mockResolvedValue(null);
  const jar = new Map<string, string>();
  (cookies as jest.Mock).mockResolvedValue({ set: (key: string, value: string) => jar.set(key, value), get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined });
  expect(await hasOrderAccess({ id: "A", userId: null })).toBe(false);
  await grantOrderAccess("A");
  expect(await hasOrderAccess({ id: "A", userId: null })).toBe(true);
  jar.set("order-access-B", jar.get("order-access-A")!.replace(/^A\./, "B."));
  expect(await hasOrderAccess({ id: "B", userId: null })).toBe(false);
  jar.set("order-access-A", jar.get("order-access-A")!.slice(0, -2) + "xx");
  expect(await hasOrderAccess({ id: "A", userId: null })).toBe(false);
});
