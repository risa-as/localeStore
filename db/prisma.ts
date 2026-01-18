import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

// Enable WebSocket for transactions
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

const prismaClientSingleton = () => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing!");
  }

  const adapter = new PrismaNeon({
    connectionString,
  });

  return new PrismaClient({ adapter }).$extends({
    result: {
      product: {
        price: {
          compute(product) {
            return product.price?.toString() ?? "";
          },
        },
        rating: {
          compute(product) {
            return product.rating?.toString() ?? "";
          },
        },
      },
      cart: {
        itemsPrice: {
          needs: { itemsPrice: true },
          compute(cart) {
            return cart.itemsPrice?.toString() ?? "0";
          },
        },
        shippingPrice: {
          needs: { shippingPrice: true },
          compute(cart) {
            return cart.shippingPrice?.toString() ?? "0";
          },
        },
        taxPrice: {
          needs: { taxPrice: true },
          compute(cart) {
            return cart.taxPrice?.toString() ?? "0";
          },
        },
        totalPrice: {
          needs: { totalPrice: true },
          compute(cart) {
            return cart.totalPrice?.toString() ?? "0";
          },
        },
      },
      order: {
        totalPrice: {
          needs: { totalPrice: true },
          compute(order) {
            return order.totalPrice?.toString() ?? "0";
          },
        },
      },
      orderItem: {
        price: {
          compute(orderItem) {
            return orderItem.price?.toString() ?? "0";
          },
        },
      },
    },
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
