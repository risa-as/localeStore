import { getWaThread } from "../actions/whatsapp.actions";
import { requireStaff } from "../authorization";
import { prisma } from "@/db/prisma";
jest.mock("../authorization", () => ({ requireStaff: jest.fn() }));
jest.mock("../whatsapp", () => ({ WA_TEMPLATE_BODY_PREFIX: {}, getWaConfig: jest.fn(), sendWaText: jest.fn(), sendWaImage: jest.fn(), uploadWaMedia: jest.fn() }));
jest.mock("@/db/prisma", () => ({ prisma: {
  waConversation: { findUnique: jest.fn(), update: jest.fn() }, waMessage: { findMany: jest.fn() }, order: { findMany: jest.fn() },
} }));
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requireStaff).mockResolvedValue({ user: { id: "staff", role: "admin" } } as never);
});
it("checks current staff authorization before reading a thread or customer orders", async () => {
  jest.mocked(requireStaff).mockRejectedValueOnce(new Error("revoked"));
  await expect(getWaThread("c1")).rejects.toThrow("revoked");
  expect(prisma.waConversation.findUnique).not.toHaveBeenCalled(); expect(prisma.order.findMany).not.toHaveBeenCalled();
});
it("returns the order's actual phone and archival state for safe status-tab links", async () => {
  jest.mocked(prisma.waConversation.findUnique).mockResolvedValue({ id: "c1", phone: "07728611871", customerName: "زبون", unreadCount: 0, windowExpiresAt: null } as never);
  jest.mocked(prisma.waMessage.findMany).mockResolvedValue([]);
  jest.mocked(prisma.order.findMany).mockResolvedValue([{ id: "o1", status: "pending", phoneNumber: "07728611871", isArchived: false,
    totalPrice: "70", createdAt: new Date("2026-10-25T08:00:00Z"), orderitems: [{ name: "منتج", qty: 6 }] }] as never);
  const result = await getWaThread("c1");
  expect(result?.orders[0]).toMatchObject({ id: "o1", status: "pending", phoneNumber: "07728611871", isArchived: false, totalPrice: 70, items: "منتج × 6" });
  expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { phoneNumber: "07728611871" }, select: expect.objectContaining({ phoneNumber: true, isArchived: true }),
  }));
});
it("does not query orders for a missing conversation", async () => {
  jest.mocked(prisma.waConversation.findUnique).mockResolvedValue(null);
  expect(await getWaThread("missing")).toBeNull(); expect(prisma.order.findMany).not.toHaveBeenCalled();
});
