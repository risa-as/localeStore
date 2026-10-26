jest.mock("@/db/prisma", () => ({ prisma: {} }));
import { transitionOrder } from "./status-service";

function fixture() {
  const orders = new Map<string, any>();
  const allocations: any[] = [];
  const outbox = new Map<string, any>();
  for (const id of ["A", "B", "C"]) orders.set(id, { id, status: "home", inventoryDispatchedAt: null, inventoryReturnedAt: null, deliveredAt: null, fullName: "Test", phoneNumber: "07000000000", totalPrice: 30, orderitems: [{ productId: "P", qty: 1, costPrice: 99, name: "Product", costTotal: null }] });
  const tx: any = {
    $queryRaw: jest.fn(),
    order: {
      findUniqueOrThrow: async ({ where }: any) => structuredClone(orders.get(where.id)),
      update: async ({ where, data }: any) => Object.assign(orders.get(where.id), data),
    },
    product: { findUniqueOrThrow: async () => ({ stock: 3 }) },
    productBatch: { findMany: async () => [{ id: "first", quantity: 1, costPrice: 10 }, { id: "second", quantity: 2, costPrice: 20 }] },
    orderItem: {
      aggregate: async () => ({ _sum: { qty: 0 } }),
      update: async ({ where, data }: any) => Object.assign(orders.get(where.orderId_productId.orderId).orderitems[0], data),
    },
    inventoryAllocation: {
      findMany: async () => allocations.filter(a => !a.returnedAt),
      create: async ({ data }: any) => allocations.push({ ...data, returnedAt: null }),
      updateMany: async ({ where, data }: any) => allocations.filter(a => a.orderId === where.orderId && !a.returnedAt).forEach(a => Object.assign(a, data)),
    },
    orderStatusEvent: { create: async () => ({ id: "event" }) },
    messageOutbox: { upsert: async ({ where, create }: any) => { if (!outbox.has(where.eventKey)) outbox.set(where.eventKey, create); } },
  };
  return { tx, orders, allocations, outbox };
}

it("returning A preserves B's cost and releases A's original batch only on receipt", async () => {
  const { tx, orders, allocations, outbox } = fixture();
  await transitionOrder(tx, "A", "pending", "test");
  await transitionOrder(tx, "B", "pending", "test");
  expect(orders.get("B").orderitems[0].costTotal).toBe(20);
  await transitionOrder(tx, "A", "returned", "test");
  expect(allocations.find(a => a.orderId === "A").returnedAt).toBeNull();
  await transitionOrder(tx, "A", "returnReceived", "test");
  await transitionOrder(tx, "C", "pending", "test");
  expect(orders.get("B").orderitems[0].costTotal).toBe(20);
  expect(orders.get("C").orderitems[0].costTotal).toBe(10);
  expect(outbox.size).toBe(1);
});

it("repeated transitions do not allocate twice or create another return inquiry", async () => {
  const { tx, allocations, outbox } = fixture();
  await transitionOrder(tx, "A", "pending", "test");
  expect(await transitionOrder(tx, "A", "pending", "test")).toBe(false);
  expect(allocations).toHaveLength(1);
  await transitionOrder(tx, "A", "returned", "test");
  await transitionOrder(tx, "A", "returned", "test");
  expect(outbox.size).toBe(1);
  await expect(transitionOrder(tx, "A", "home", "test")).rejects.toThrow();
});
