jest.mock("@/db/prisma", () => ({ prisma: {} }));
import { reserveOrderStock } from "./reservations";

function tx(product: { isArchived: boolean }, qty = 5) {
  const order = { id: "O", status: "home", orderitems: [{ productId: "P", qty, name: "Product" }] };
  return {
    $queryRaw: jest.fn(),
    order: { findUniqueOrThrow: async () => order, update: jest.fn(async () => order) },
    product: { findUniqueOrThrow: async () => product },
  } as unknown as Parameters<typeof reserveOrderStock>[0] & { order: { update: jest.Mock } };
}

it("accepts and reserves an order even when the product has no stock left", async () => {
  const t = tx({ isArchived: false });
  await expect(reserveOrderStock(t, "O")).resolves.toBeUndefined();
  expect(t.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: { reservationExpiresAt: expect.any(Date) } }));
});

it("still rejects an archived product with an Arabic message", async () => {
  await expect(reserveOrderStock(tx({ isArchived: true }), "O")).rejects.toThrow("المنتج لم يعد متاحاً");
});
