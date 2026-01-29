"use server";
import { cookies, headers } from "next/headers";

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

// Helper to check for fraud
async function checkForFraud(ip: string, newPhone: string, newGov: string): Promise<boolean> {
  if (!ip) return false;

  // Get all previous orders from this IP
  const existingOrders = await prisma.order.findMany({
    where: { ip },
    select: { phoneNumber: true, governorate: true }
  });

  if (existingOrders.length === 0) return false;

  // Collect unique phone numbers and governorates
  const phoneNumbers = new Set(existingOrders.map(o => o.phoneNumber));
  const governorates = new Set(existingOrders.map(o => o.governorate));

  // Add the new details
  phoneNumbers.add(newPhone);
  governorates.add(newGov);

  // Fraud Logic: 
  // 1. More than 2 different phone numbers
  // 2. More than 1 different governorate (i.e. different governorates)
  if (phoneNumbers.size > 2 || governorates.size > 1) {
    return true;
  }

  return false;
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
    const session = await auth();
    const userId = session?.user?.id;

    const cutoffDate = new Date(Date.now() - 18 * 60 * 60 * 1000);
    const recentOrder = await prisma.order.findFirst({
      where: {
        phoneNumber: orderData.phoneNumber,
        createdAt: { gte: cutoffDate },
        status: { in: ["home", "pending"] },
      },
      include: { orderitems: true },
    });

    if (recentOrder) {
      // Checking if item exists
      const existingItem = recentOrder.orderitems.find(
        (item) => item.productId === product.id
      );

      await prisma.$transaction(async (tx) => {
        if (existingItem) {
          // Update quantity
          await tx.orderItem.update({
            where: {
              orderId_productId: {
                orderId: recentOrder.id,
                productId: existingItem.productId,
              }
            },
            data: {
              qty: existingItem.qty + orderData.quantity,
            },
          });
        } else {
          // Add new item
          await tx.orderItem.create({
            data: {
              orderId: recentOrder.id,
              productId: product.id,
              slug: product.slug,
              name: product.name,
              qty: orderData.quantity,
              image: product.images[0] || "/placeholder.jpg",
              price: product.price,
              selectedColor: orderData.selectedColor,
              shippingPrice: product.shippingPrice, // Save shipping price
            },
          });
        }

        // Recalculate total
        const updatedItems = await tx.orderItem.findMany({ where: { orderId: recentOrder.id } });

        // Items Price
        const itemsPrice = updatedItems.reduce((acc, item) => acc + (Number(item.price) * item.qty), 0);

        // Flat Shipping (Max of items)
        const shippingPrice = updatedItems.length > 0
          ? Math.max(...updatedItems.map((item) => Number(item.shippingPrice)))
          : 0;

        const newTotalPrice = itemsPrice + shippingPrice;

        await tx.order.update({
          where: { id: recentOrder.id },
          data: {
            totalPrice: newTotalPrice,
            fullName: orderData.fullName,
            governorate: orderData.governorate,
            address: orderData.address,
            userId: session?.user?.id, // Link to user if logged in
          }
        });
      });

      return {
        success: true,
        message: "تم تحديث طلبك بنجاح",
        redirectTo: `/thank-you?orderId=${recentOrder.id}`,
      };
    }


    // Create Order
    // Flat Rate Shipping: (Price * Qty) + Shipping
    const itemsPrice = Number(product.price) * orderData.quantity;
    const shippingPrice = Number(product.shippingPrice);
    const price = itemsPrice + shippingPrice;



    // Capture IP
    const ip = (await headers()).get('x-forwarded-for');

    // Create a transaction to create order and order items in database
    const insertedOrderId = await prisma.$transaction(async (tx) => {
      // Create order
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { selectedColor, quantity, ...orderDataWithoutColor } = orderData;
      const insertedOrder = await tx.order.create({
        data: {
          ...orderDataWithoutColor,
          quantity: orderData.quantity,
          totalPrice: price,
          status: await checkForFraud(ip as string, orderData.phoneNumber, orderData.governorate) ? "banned" : "home",
          userId,
          ip: ip as string,
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
          image: product.images[0] || "/placeholder.jpg",
          price: product.price,
          selectedColor: orderData.selectedColor,
          shippingPrice: product.shippingPrice, // Save Shipping Price
        },
      });

      return insertedOrder.id;
    });

    if (!insertedOrderId) throw new Error("Order not created");

    // cookieStore.delete("guest-shipping-info"); // Clear guest info after successful order

    return {
      success: true,
      message: "Order created",
      redirectTo: `/thank-you?orderId=${insertedOrderId}`,
    };
  } catch (error) {
    console.error("Error in createQuickOrder:", error);
    if (isRedirectError(error)) throw error;
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}

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
    const itemsPrice = cart.items.reduce((acc, item) => acc + (Number(item.price) * item.qty), 0);
    const shippingPrice = cart.items.length > 0
      ? Math.max(...cart.items.map((item) => Number(item.shippingPrice)))
      : 0;
    const price = itemsPrice + shippingPrice;

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
        status: { in: ["home", "pending"] },
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
              where: {
                orderId_productId: {
                  orderId: recentOrder.id,
                  productId: existingItem.productId,
                }
              },
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
                shippingPrice: item.shippingPrice, // Create with shipping
              },
            });
          }
        }

        // Recalculate Total Price
        const updatedItems = await tx.orderItem.findMany({ where: { orderId: recentOrder.id } });

        // Items Price
        const newItemsPrice = updatedItems.reduce((acc, item) => acc + (Number(item.price) * item.qty), 0);

        // Flat Shipping
        const newShippingPrice = updatedItems.length > 0
          ? Math.max(...updatedItems.map((item) => Number(item.shippingPrice)))
          : 0;

        const newTotalPrice = newItemsPrice + newShippingPrice;

        await tx.order.update({
          where: { id: recentOrder.id },
          data: {
            totalPrice: newTotalPrice,
            fullName: orderData.fullName,
            governorate: orderData.governorate,
            address: orderData.address,
            userId: userId ?? recentOrder.userId, // Link to user if logged in
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

    // Capture IP
    const ip = (await headers()).get('x-forwarded-for');

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
          status: await checkForFraud(ip as string, orderData.phoneNumber, orderData.governorate) ? "banned" : "home", // Check fraud
          ip: ip as string,
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
            shippingPrice: item.shippingPrice, // Add shipping price
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
    console.error("Error in createQuickOrder:", error);
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
      user: true,
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
        OR: [
          { fullName: { contains: query, mode: "insensitive" } },
          { phoneNumber: { contains: query, mode: "insensitive" } },
          { address: { contains: query, mode: "insensitive" } },
          { governorate: { contains: query, mode: "insensitive" } },
        ]
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

// Get All Orders For Export (No Pagination)
export async function getAllOrdersForExport({
  query,
  status,
}: {
  query: string;
  status?: string;
}) {
  const queryFilter: Prisma.OrderWhereInput =
    query && query !== "all"
      ? {
        OR: [
          { fullName: { contains: query, mode: "insensitive" } },
          { phoneNumber: { contains: query, mode: "insensitive" } },
          { address: { contains: query, mode: "insensitive" } },
          { governorate: { contains: query, mode: "insensitive" } },
        ]
      }
      : {};

  if (status && status !== 'all') {
    (queryFilter as any).status = status;
  }

  const data = await prisma.order.findMany({
    where: {
      ...queryFilter,
    },
    orderBy: { createdAt: "desc" },
    include: {
      orderitems: true,
    }
  });

  return convertToPlainObject(data);
}

// Get My Orders
export async function getMyOrders({
  limit = PAGE_SIZE,
  page,
}: {
  limit?: number;
  page: number;
  query?: string;
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
        status: order.status,
        notes: order.notes
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
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Get monthly sales
  const salesDataRaw = await prisma.$queryRaw<
    Array<{ month: string; totalSales: Prisma.Decimal }>
  >`SELECT to_char("createdAt", 'MM/YY') as "month", sum("totalPrice") as "totalSales" FROM "Order" GROUP BY to_char("createdAt", 'MM/YY') ORDER BY min("createdAt")`;

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
        createdAt: { gte: currentMonthStart },
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

  // --- Real Stats Calculation ---

  // Helper to get count for a range
  const getCount = async (model: any, start: Date, end?: Date) => {
    return await model.count({
      where: {
        createdAt: {
          gte: start,
          ...(end ? { lte: end } : {}),
        },
      },
    });
  };

  // Helper to get sum for a range (Sales)
  const getSalesSum = async (start: Date, end?: Date) => {
    const result = await prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: {
        createdAt: {
          gte: start,
          ...(end ? { lte: end } : {}),
        },
      },
    });
    return Number(result._sum.totalPrice || 0);
  };

  // 1. Orders
  const currentMonthOrders = await getCount(prisma.order, currentMonthStart);
  const prevMonthOrders = await getCount(prisma.order, previousMonthStart, previousMonthEnd);
  const ordersChange = prevMonthOrders === 0 ? currentMonthOrders * 100 : ((currentMonthOrders - prevMonthOrders) / prevMonthOrders) * 100;

  // 2. Users
  const currentMonthUsers = await getCount(prisma.user, currentMonthStart);
  const prevMonthUsers = await getCount(prisma.user, previousMonthStart, previousMonthEnd);
  const usersChange = prevMonthUsers === 0 ? currentMonthUsers * 100 : ((currentMonthUsers - prevMonthUsers) / prevMonthUsers) * 100;

  // 3. Products
  const currentMonthProducts = await getCount(prisma.product, currentMonthStart);
  const prevMonthProducts = await getCount(prisma.product, previousMonthStart, previousMonthEnd);
  const productsChange = prevMonthProducts === 0 ? currentMonthProducts * 100 : ((currentMonthProducts - prevMonthProducts) / prevMonthProducts) * 100;

  // 4. Revenue (Sales)
  const currentMonthRevenue = await getSalesSum(currentMonthStart);
  const prevMonthRevenue = await getSalesSum(previousMonthStart, previousMonthEnd);
  const revenueChange = prevMonthRevenue === 0 ? currentMonthRevenue * 100 : ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;


  return {
    ordersCount: currentMonthOrders,
    productsCount: currentMonthProducts,
    usersCount: currentMonthUsers,
    totalSales: currentMonthRevenue,
    totalProfit,
    salesData,
    latestOrders,
    statsChange: {
      orders: Math.round(ordersChange),
      users: Math.round(usersChange),
      products: Math.round(productsChange),
      revenue: Math.round(revenueChange),
    }
  };
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


