jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/db/prisma", () => ({ prisma: { user: { findUnique: jest.fn() } } }));
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { requireAdministrator, requireStaff, requireUser } from "./authorization";

const session = auth as jest.Mock;
const findUser = prisma.user.findUnique as jest.Mock;

it("rejects anonymous users before querying account data", async () => {
  session.mockResolvedValue(null);
  await expect(requireUser()).rejects.toThrow();
  expect(findUser).not.toHaveBeenCalled();
});

it("uses the current role instead of an old administrator session", async () => {
  session.mockResolvedValue({ user: { id: "u", role: "admin" } });
  findUser.mockResolvedValue({ id: "u", role: "user" });
  await expect(requireAdministrator()).rejects.toThrow();
  await expect(requireStaff()).rejects.toThrow();
});

it("revokes a disabled account immediately", async () => {
  session.mockResolvedValue({ user: { id: "u", role: "admin" } });
  findUser.mockResolvedValue({ id: "u", role: "disabled" });
  await expect(requireUser()).rejects.toThrow();
});

it("allows staff operations but restricts administration to administrators", async () => {
  session.mockResolvedValue({ user: { id: "u", role: "employee" } });
  findUser.mockResolvedValue({ id: "u", role: "employee" });
  await expect(requireStaff()).resolves.toMatchObject({ user: { id: "u" } });
  await expect(requireAdministrator()).rejects.toThrow();
});
