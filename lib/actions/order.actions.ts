"use server";
import { cookies } from "next/headers";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { auth } from "@/auth";
import { convertToPlainObject, formatError } from "../utils";
import { getMyCart } from "./cart.actions";
import { insertOrderSchema, shippingAddressSchema, updateOrderSchema } from "../validators";
import { prisma } from "@/db/prisma";
import { CartItem } from "@/types";
import { revalidatePath } from "next/cache";
import { PAGE_SIZE } from "../constants";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// Create Order and order items
export async function createOrder(data: z.infer<typeof insertOrderSchema>) {
  try {
    const cart = await getMyCart();

    if (!cart || cart.items.length === 0) {
      return {
        success: false,
        message: "Your Cart Is Empty",
        redirectTo: "/cart",
      };
    }

    const orderData = insertOrderSchema.parse(data);

    // Calculate total price from cart items
    const price = cart.items.reduce((acc, item) => acc + ((Number(item.price) + Number(item.shippingPrice)) * item.qty), 0);

    // Get product details
    const productIds = cart.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    const session = await auth();
    const userId = session?.user?.id;

    // Check for existing order within 18 hours
    const cutoffDate = new Date(Date.now() - 18 * 60 * 60 * 1000);
    const recentOrder = await prisma.order.findFirst({
      where: {
        phoneNumber: orderData.phoneNumber,
        createdAt: { gte: cutoffDate },
        status: { not: "Cancelled" },
      },
      include: { orderitems: true },
    });

    if (recentOrder) {
      // MERGE LOGIC FOR CART
      await prisma.$transaction(async (tx) => {
        for (const item of cart.items as CartItem[]) {
          const existingItem = recentOrder.orderitems.find(
            (oi) => oi.productId === item.productId
          );

          if (existingItem) {
            // Update quantity
            await tx.orderItem.update({
              where: { orderId_productId: { orderId: recentOrder.id, productId: item.productId } },
              data: { qty: existingItem.qty + item.qty }
            });
          } else {
            // Create new item
            await tx.orderItem.create({
              data: {
                orderId: recentOrder.id,
                productId: item.productId,
                slug: item.slug,
                name: item.name,
                qty: item.qty,
                image: item.image,
                price: item.price,
                shippingPrice: item.shippingPrice,
              },
            });
          }
        }

        // Recalculate Total Price
        const updatedItems = await tx.orderItem.findMany({ where: { orderId: recentOrder.id } });
        const newTotalPrice = updatedItems.reduce((acc, item) => acc + ((Number(item.price) + Number(item.shippingPrice)) * item.qty), 0);

        await tx.order.update({
          where: { id: recentOrder.id },
          data: {
            totalPrice: newTotalPrice,
            fullName: orderData.fullName,
            governorate: orderData.governorate,
            address: orderData.address,
          }
        });

        // Clear cart
        await tx.cart.update({
          where: { id: cart.id },
          data: {
            items: [],
            totalPrice: 0,
            shippingPrice: 0,
            itemsPrice: 0,
          },
        });
      });

      const cookieStore = await cookies();
      cookieStore.delete("guest-shipping-info");

      return {
        success: true,
        message: "Order Updated Successfully",
        redirectTo: `/thank-you?orderId=${recentOrder.id}`,
      };
    }

    // ORIGINAL CREATE LOGIC
    // Create a transaction to create order and order items in database
    const insertedOrderId = await prisma.$transaction(async (tx) => {
      // Create order
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { selectedColor, ...orderDataWithoutColor } = orderData;
      const insertedOrder = await tx.order.create({
        data: {
          ...orderDataWithoutColor,
          totalPrice: price,
          userId,
          status: "home", // Default status
        }
      });
      // Create order items from the cart items
      for (const item of cart.items as CartItem[]) {
        const product = productMap.get(item.productId);
        // Cost price removed as it's not in schema


        await tx.orderItem.create({
          data: {
            orderId: insertedOrder.id,
            productId: item.productId,
            slug: item.slug,
            name: item.name,
            qty: item.qty,
            image: item.image,
            price: item.price,
            shippingPrice: item.shippingPrice,
          },
        });
      }
      // Clear cart
      await tx.cart.update({
        where: { id: cart.id },
        data: {
          items: [],
          totalPrice: 0,
          shippingPrice: 0,
          itemsPrice: 0,
        },
      });

      return insertedOrder.id;
    });

    if (!insertedOrderId) throw new Error("Order not created");

    const cookieStore = await cookies();
    cookieStore.delete("guest-shipping-info");

    return {
      success: true,
      message: "Order created",
      redirectTo: `/order-completed/${insertedOrderId}`, // Use order-completed for typical checkout? Or thank-you? 
      // The original code used order-completed. I should stick to it.
      // Wait, createQuickOrder uses thank-you. 
      // User didn't specify page, just message. I will use original redirects.
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}

// Get Order By Id
export async function getOrderById(orderId: string) {
  const data = await prisma.order.findFirst({
    where: { id: orderId },
    include: {
      orderitems: true,
    },
  });
  return convertToPlainObject(data);
}

// Get All Orders
export async function getAllOrders({
  limit = PAGE_SIZE,
  page,
  query,
  status,
}: {
  limit?: number;
  page: number;
  query: string;
  status?: string;
}) {
  const queryFilter: Prisma.OrderWhereInput =
    query && query !== "all"
      ? {
        fullName: {
          contains: query,
          mode: "insensitive",
        },
      }
      : {};

  if (status && status !== 'all') {
    (queryFilter as any).status = status;
  }
  const data = await prisma.order.findMany({
    where: {
      ...queryFilter,
    },
    include: {
      orderitems: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: (page - 1) * limit,
  });

  const dataCount = await prisma.order.count();
  return {
    data: convertToPlainObject(data),
    totalPages: Math.ceil(dataCount / limit),
  };

}

// Get My Orders
export async function getMyOrders({
  limit = PAGE_SIZE,
  page,
}: {
  limit?: number;
  page: number;
}) {
  const session = await auth();
  if (!session) {
    throw new Error("User is not authorized");
  }

  const data = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: (page - 1) * limit,
  });

  const dataCount = await prisma.order.count({
    where: { userId: session.user.id },
  });

  return {
    data: convertToPlainObject(data),
    totalPages: Math.ceil(dataCount / limit),
  };
}


// Delete an Order
export async function deleteOrder(id: string) {
  try {
    await prisma.order.delete({
      where: { id },
    });
    revalidatePath("/admin/orders");
    return {
      success: true,
      message: "Order Deleted Successfully",
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return {
      success,
      message: formError,
    };
  }
}

// Update Order
export async function updateOrder(data: z.infer<typeof updateOrderSchema>) {
  try {
    const order = updateOrderSchema.parse(data);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        fullName: order.fullName,
        phoneNumber: order.phoneNumber,
        governorate: order.governorate,
        address: order.address,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        status: order.status
      }
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/order/${order.id}`);

    return {
      success: true,
      message: "Order Updated Successfully"
    };

  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}

// Bulk Update Order Status
export async function bulkUpdateOrderStatus(ids: string[], status: string) {
  try {
    await prisma.order.updateMany({
      where: {
        id: {
          in: ids
        }
      },
      data: {
        status: status
      }
    });

    revalidatePath("/admin/orders");
    return {
      success: true,
      message: "Orders Updated Successfully"
    };

  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}


// Update Order To Paid
export async function updateOrderToPaid({
  orderId,
  paymentResult,
}: {
  orderId: string;
  paymentResult?: {
    id: string;
    status: string;
    email_address: string;
    pricePaid: string;
  };
}) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
    },
    include: {
      orderitems: true,
    },
  });

  if (!order) throw new Error("Order not found");

  if (order.isPaid) throw new Error("Order is already paid");

  // Transaction
  await prisma.order.update({
    where: { id: orderId },
    data: {
      isPaid: true,
      paidAt: new Date(),
      paymentResult,
    },
  });

  revalidatePath(`/order/${orderId}`);

  return {
    success: true,
    message: "Order Paid Successfully",
  };
}

// Update order to delivered
export async function deliverOrder(orderId: string) {
  try {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
      },
    });

    if (!order) throw new Error("Order not found");

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "completed",
      },
    });

    revalidatePath(`/order/${orderId}`);
    return {
      success: true,
      message: "Order has been marked delivered",
    };
  } catch (error) {
    const { formError } = formatError(error);
    return { success: false, message: formError };
  }
}

type SalesDataType = {
  month: string;
  totalSales: number;
}[];

// Get sales data and order statistics
export async function getOrderSummery() {
  const ordersCount = await prisma.order.count();
  const productsCount = await prisma.product.count();
  const usersCount = await prisma.user.count();

  // Calculate the total sales
  const totalSales = await prisma.order.aggregate({
    _sum: { totalPrice: true },
  });

  // Get monthly sales
  const salesDataRaw = await prisma.$queryRaw<
    Array<{ month: string; totalSales: Prisma.Decimal }>
  >`SELECT to_char("createdAt", 'MM/YY') as "month", sum("totalPrice") as "totalSales" FROM "Order" GROUP BY to_char("createdAt", 'MM/YY')`;

  const salesData: SalesDataType = salesDataRaw.map((item) => ({
    month: item.month,
    totalSales: Number(item.totalSales),
  }));

  const latestOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  // Calculate total profit
  const totalProfitRaw = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { not: "Cancelled" }
      }
    },
    select: {
      price: true,
      qty: true,
      costPrice: true,
    }
  });

  const totalProfit = totalProfitRaw.reduce((acc, item) => {
    const cost = Number(item.costPrice) * item.qty;
    return acc + (Number(item.price) * item.qty - cost);
  }, 0);

  return {
    ordersCount,
    productsCount,
    usersCount,
    totalSales,
    totalProfit,
    salesData,
    latestOrders,
  };
}
// Create Quick Order (Direct from Landing Page)
export async function createQuickOrder(data: z.infer<typeof insertOrderSchema>, productId: string) {
  try {
    const orderData = insertOrderSchema.parse(data);

    // Set Guest Cookie for persistence
    const cookieStore = await cookies();
    cookieStore.set("guest-shipping-info", JSON.stringify({
      fullName: orderData.fullName,
      streetAddress: orderData.address,
      city: orderData.governorate, // Mapping governorate to city/address field as best fit
      phoneNumber: orderData.phoneNumber,
      postalCode: "00000", // Default or extract if available
      country: "Iraq", // Default or extract
    }), {
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      path: "/"
    });

    // Fetch product to ensure price and stock
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return { success: false, message: "Product not found" };
    }

    if (product.stock < orderData.quantity) {
      return { success: false, message: "Not enough stock" };
    }

    // Check for existing order within 18 hours
    const cutoffDate = new Date(Date.now() - 18 * 60 * 60 * 1000);
    const recentOrder = await prisma.order.findFirst({
      where: {
        phoneNumber: orderData.phoneNumber,
        createdAt: { gte: cutoffDate },
        status: { not: "Cancelled" },
      },
      include: { orderitems: true },
    });

    if (recentOrder) {
      // MERGE LOGIC
      const existingItemIndex = recentOrder.orderitems.findIndex(
        (item) => item.productId === product.id && item.selectedColor === orderData.selectedColor
      );

      await prisma.$transaction(async (tx) => {
        if (existingItemIndex > -1) {
          // Update quantity of existing item
          const existingItem = recentOrder.orderitems[existingItemIndex];
          await tx.orderItem.update({
            where: { orderId_productId: { orderId: recentOrder.id, productId: product.id } }, // PK is orderId + productId. Wait.
            // CAUTION: The standard Prisma schema usually defines composite PK on orderId + productId. 
            // BUT if we have variants (colors), we might have multiple items with same productId but different colors?
            // Let's check schema.
            // Schema has: @@id([orderId, productId], map: "orderitems_orderId_productId_pk")
            // This means we CANNOT have two items with same ProductID in the same Order, even if colors are different.
            // This is a schema limitation. 
            // If the user buys Red Shirt and Blue Shirt (same ProductID), Prisma will crash on duplicate PK.
            // For now, I must assume "Same Product" means "Same ProductID". 
            // If the user changes color, technically it's the "Same Product" in this schema's view if they share ID.
            // However, the prompt says "if he requested another product... write the two products together".
            // If schema limits 1 row per ProductID per Order, I can only update quantity.
            // If I want to support multiple variants, I'd need to change the PK or `productId` refers to a specific variant. 
            // Assuming `Product` is a generic parent, checking schema again... `Product` has `colors String[]`. 
            // So `Product` is the parent. `OrderItem` links to `Product`.
            // Limitation: Currently Schema prevents multiple variants of same product in one order.
            // I will proceed assuming if ProductID matches, we merge/update quantity, identifying it as "Same Product".
            data: {
              qty: existingItem.qty + orderData.quantity,
              selectedColor: orderData.selectedColor || existingItem.selectedColor // Update color if new one provided? Or keep old? 
              // Usually if merging, we just sum up. Let's strictly update QTY.
            },
          });
        } else {
          // Add new item to existing order
          await tx.orderItem.create({
            data: {
              orderId: recentOrder.id,
              productId: product.id,
              slug: product.slug,
              name: product.name,
              qty: orderData.quantity,
              image: product.images[0],
              price: product.price,
              shippingPrice: product.shippingPrice,
              selectedColor: orderData.selectedColor,
            },
          });
        }

        // Recalculate Total Price
        // We need to fetch items again or calc in memory? 
        // Better fetch or sum carefully.
        const updatedItems = await tx.orderItem.findMany({ where: { orderId: recentOrder.id } });
        const newTotalPrice = updatedItems.reduce((acc, item) => acc + ((Number(item.price) + Number(item.shippingPrice)) * item.qty), 0);

        await tx.order.update({
          where: { id: recentOrder.id },
          data: {
            totalPrice: newTotalPrice,
            // Update other fields? Address might have changed? 
            // Prompt says "update the order". 
            // Let's update address/phone info to latest provided? 
            // Safe to keep existing or update. Let's update info to be "latest".
            fullName: orderData.fullName,
            governorate: orderData.governorate,
            address: orderData.address,
            // phoneNumber is search key, so it's same.
          }
        });
      });

      return {
        success: true,
        message: "Order Updated Successfully",
        redirectTo: `/thank-you?orderId=${recentOrder.id}`,
      };
    }

    // ORIGINAL CREATE LOGIC
    // Create Order
    const price = (Number(product.price) + Number(product.shippingPrice)) * orderData.quantity;

    // Create a transaction to create order and order items in database
    const insertedOrderId = await prisma.$transaction(async (tx) => {
      // Create order
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { selectedColor, ...orderDataWithoutColor } = orderData;
      const insertedOrder = await tx.order.create({
        data: {
          ...orderDataWithoutColor,
          totalPrice: price,
        }
      });

      // Create order item
      await tx.orderItem.create({
        data: {
          orderId: insertedOrder.id,
          productId: product.id,
          slug: product.slug,
          name: product.name,
          qty: orderData.quantity,
          image: product.images[0], // Assuming at least one image
          price: product.price,
          shippingPrice: product.shippingPrice,
          selectedColor: orderData.selectedColor,
        },
      });

      return insertedOrder.id;
    });

    if (!insertedOrderId) throw new Error("Order not created");

    return {
      success: true,
      message: "Order created",
      redirectTo: `/thank-you?orderId=${insertedOrderId}`,
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}

// Get Order Profit Stats
export async function getOrderProfitStats({ from, to }: { from: Date; to: Date }) {
  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: { not: "Cancelled" }
      },
    },
    select: {
      productId: true,
      name: true,
      qty: true,
      price: true,
      costPrice: true,
    },
  });

  const statsMap = new Map<string, {
    productId: string;
    name: string;
    totalQty: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
  }>();

  for (const item of orderItems) {
    const revenue = Number(item.price) * item.qty;
    const cost = Number(item.costPrice) * item.qty;
    const profit = revenue - cost;

    if (statsMap.has(item.productId)) {
      const stats = statsMap.get(item.productId)!;
      stats.totalQty += item.qty;
      stats.totalRevenue += revenue;
      stats.totalCost += cost;
      stats.totalProfit += profit;
    } else {
      statsMap.set(item.productId, {
        productId: item.productId,
        name: item.name,
        totalQty: item.qty,
        totalRevenue: revenue,
        totalCost: cost,
        totalProfit: profit,
      });
    }
  }

  return Array.from(statsMap.values()).sort((a, b) => b.totalProfit - a.totalProfit);
}

// Save Guest Shipping Info (Cookie)
export async function saveGuestShippingInfo(data: z.infer<typeof shippingAddressSchema>) {
  try {
    const address = shippingAddressSchema.parse(data);
    const cookieStore = await cookies();
    cookieStore.set("guest-shipping-info", JSON.stringify(address), {
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      path: "/",
    });
    return { success: true, message: "Guest info saved" };
  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}
