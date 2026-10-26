import { getAvailableStocks } from "../inventory";
import { prisma } from "@/db/prisma";
import { STOCK_CONSUMED_STATUSES } from "../constants/order-statuses";
jest.mock("@/db/prisma", () => ({ prisma: { orderItem: { findMany: jest.fn(), groupBy: jest.fn() } } }));
beforeEach(() => jest.resetAllMocks());
it("subtracts goods outside the warehouse and active reservations in a single batch", async () => {
  jest.mocked(prisma.orderItem.findMany).mockResolvedValue([{ productId: "p1", qty: 3 }, { productId: "p1", qty: 2 }, { productId: "p2", qty: 10 }] as never);
  jest.mocked(prisma.orderItem.groupBy).mockResolvedValue([{ productId: "p1", _sum: { qty: 2 } }] as never);
  expect(await getAvailableStocks([{ id: "p1", stock: 10 }, { id: "p2", stock: 4 }]))
    .toEqual(new Map([["p1", 3], ["p2", 0]]));
  expect(prisma.orderItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ order: { status: { in: STOCK_CONSUMED_STATUSES } } }) }));
  expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ order: { status: "home", reservationExpiresAt: { gt: expect.any(Date) } } }) }));
});
it("does not read all inventory when the product search is empty", async () => {
  expect(await getAvailableStocks([])).toEqual(new Map());
  expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
  expect(prisma.orderItem.groupBy).not.toHaveBeenCalled();
});
