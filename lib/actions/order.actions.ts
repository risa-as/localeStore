"use server";
import { cookies, headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { auth } from "@/auth";
import { convertToPlainObject, formatError } from "../utils";
import { getMyCart } from "./cart.actions";
import { insertOrderSchema, updateOrderSchema } from "../validators";
import { prisma } from "@/db/prisma";
import { CartItem } from "@/types";
import { revalidatePath } from "next/cache";
import { PAGE_SIZE } from "../constants";
import { REVENUE_STATUSES } from "../constants/order-statuses";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDeliveryProvider, type DeliveryOrderInput } from "@/lib/delivery";
import { buildFefoContexts, saleKey } from "@/lib/fefo-cogs";
import { sendOrderConfirmation, sendOrderReturned } from "@/lib/whatsapp";

// يبني مدخل التوصيل الموحّد من بيانات الطلب.
// يطبّق ×1000 على السعر المختصر (طريقة تخزيننا)، ويجمّع أسماء المنتجات.
function buildDeliveryInput(o: {
  id?: string;
  fullName?: string | null;
  phoneNumber?: string | null;
  governorate?: string | null;
  address?: string | null;
  quantity?: number | null;
  totalPrice?: Prisma.Decimal | number | string | null;
  notes?: string | null;
  orderitems?: { name: string }[] | null;
}): DeliveryOrderInput {
  const rawPrice = Number(o.totalPrice ?? 0);
  const price = rawPrice > 0 && rawPrice < 1000 ? rawPrice * 1000 : rawPrice;
  const productNames =
    o.orderitems && o.orderitems.length > 0
      ? o.orderitems.map((i) => i.name).join(" + ")
      : "طلب إلكتروني";
  return {
    clientName: o.fullName ?? "",
    phone: o.phoneNumber ?? "",
    governorate: o.governorate ?? "",
    address: o.address ?? undefined,
    itemsNumber: o.quantity ?? 1,
    price,
    productNames,
    notes: o.notes ?? undefined,
    referenceId: o.id ?? undefined,
  };
}

// Helper to check for fraud
async function checkForFraud(
  ip: string,
  newPhone: string,
  newGov: string,
): Promise<boolean> {
  if (!ip) return false;

  // Get all previous orders from this IP
  const existingOrders = await prisma.order.findMany({
    where: { ip },
    select: { phoneNumber: true, governorate: true, status: true },
  });

  if (existingOrders.length === 0) return false;

  // Check if any previous order from this IP is already banned
  if (existingOrders.some((o) => o.status === "banned")) {
    return true;
  }

  // Collect unique phone numbers and governorates
  const phoneNumbers = new Set(existingOrders.map((o) => o.phoneNumber));
  const governorates = new Set(existingOrders.map((o) => o.governorate));

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

// Actual shipping cost paid to the delivery company — reads from DB settings
async function getActualShippingCost(governorate: string): Promise<number> {
  const settings = await prisma.shippingSettings.upsert({
    where: { id: "default" },
    create: { id: "default", baghdadCost: 4000, othersCost: 5000 },
    update: {},
  });
  return governorate === "Baghdad"
    ? Number(settings.baghdadCost)
    : Number(settings.othersCost);
}

// Create Quick Order (Direct from Landing Page)
export async function createQuickOrder(
  data: z.infer<typeof insertOrderSchema>,
  productId: string,
) {
  try {
    const orderData = insertOrderSchema.parse(data);

    // Set Guest Cookie for persistence
    const cookieStore = await cookies();
    cookieStore.set(
      "guest-shipping-info",
      JSON.stringify({
        fullName: orderData.fullName,
        streetAddress: orderData.address,
        city: orderData.governorate, // Mapping governorate to city/address field as best fit
        phoneNumber: orderData.phoneNumber,
        postalCode: "00000", // Default or extract if available
        country: "Iraq", // Default or extract
      }),
      {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        path: "/",
      },
    );

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
        status: "home",
      },
      include: { orderitems: true },
    });

    if (recentOrder) {
      // Checking if item exists
      const existingItem = recentOrder.orderitems.find(
        (item) => item.productId === product.id,
      );

      await prisma.$transaction(async (tx) => {
        if (existingItem) {
          // Update quantity
          await tx.orderItem.update({
            where: {
              orderId_productId: {
                orderId: recentOrder.id,
                productId: existingItem.productId,
              },
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
              costPrice: product.costPrice,
              selectedColor: orderData.selectedColor,
              shippingPrice: product.shippingPrice,
            },
          });
        }

        // Recalculate total
        const updatedItems = await tx.orderItem.findMany({
          where: { orderId: recentOrder.id },
        });

        // Items Price
        const itemsPrice = updatedItems.reduce(
          (acc, item) => acc + Number(item.price) * item.qty,
          0,
        );

        // Flat Shipping (Max of items)
        const shippingPrice =
          updatedItems.length > 0
            ? Math.max(
                ...updatedItems.map((item) => Number(item.shippingPrice)),
              )
            : 0;

        const newTotalPrice = itemsPrice + shippingPrice;
        const newQuantity = updatedItems.reduce(
          (acc, item) => acc + item.qty,
          0,
        );

        await tx.order.update({
          where: { id: recentOrder.id },
          data: {
            totalPrice: newTotalPrice,
            shippingPrice: shippingPrice,
            quantity: newQuantity,
            fullName: orderData.fullName,
            governorate: orderData.governorate,
            address: orderData.address,
            actualShippingCost: await getActualShippingCost(
              orderData.governorate,
            ),
            userId: session?.user?.id,
          },
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
    const ip = (await headers()).get("x-forwarded-for");

    // Check for fraud
    // Exempt Admin and Employees
    const isAdminOrEmployee =
      session?.user?.role === "admin" || session?.user?.role === "employee";
    const isFraud = isAdminOrEmployee
      ? false
      : await checkForFraud(
          ip as string,
          orderData.phoneNumber,
          orderData.governorate,
        );

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
          shippingPrice: shippingPrice,
          status: isFraud ? "banned" : "home",
          actualShippingCost: await getActualShippingCost(
            orderData.governorate,
          ),
          userId,
          ip: ip as string,
        },
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
          costPrice: product.costPrice,
          selectedColor: orderData.selectedColor,
          shippingPrice: product.shippingPrice,
        },
      });

      return insertedOrder.id;
    });

    if (!insertedOrderId) throw new Error("Order not created");

    // cookieStore.delete("guest-shipping-info"); // Clear guest info after successful order
    // WhatsApp: رسالة تأكيد الطلب (كانت عبر n8n سابقاً)
    try {
      await sendOrderConfirmation({
        fullName: orderData.fullName,
        phoneNumber: orderData.phoneNumber,
        product: product.name,
        quantity: orderData.quantity,
        price: price,
      });
    } catch (err) {
      console.error("❌ WhatsApp order confirmation error:", err);
    }
    return {
      success: true,
      message: "Order created",
      redirectTo: isFraud
        ? "https://www.facebook.com"
        : `/thank-you?orderId=${insertedOrderId}`,
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
    const itemsPrice = cart.items.reduce(
      (acc, item) => acc + Number(item.price) * item.qty,
      0,
    );
    const shippingPrice =
      cart.items.length > 0
        ? Math.max(...cart.items.map((item) => Number(item.shippingPrice)))
        : 0;
    const price = itemsPrice + shippingPrice;

    // Get product details
    const productIds = cart.items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const session = await auth();
    const userId = session?.user?.id;

    // Check for existing order within 18 hours
    const cutoffDate = new Date(Date.now() - 18 * 60 * 60 * 1000);
    const recentOrder = await prisma.order.findFirst({
      where: {
        phoneNumber: orderData.phoneNumber,
        createdAt: { gte: cutoffDate },
        status: "home",
      },
      include: { orderitems: true },
    });

    if (recentOrder) {
      // MERGE LOGIC FOR CART
      await prisma.$transaction(async (tx) => {
        for (const item of cart.items as CartItem[]) {
          const existingItem = recentOrder.orderitems.find(
            (oi) => oi.productId === item.productId,
          );

          if (existingItem) {
            // Update quantity
            await tx.orderItem.update({
              where: {
                orderId_productId: {
                  orderId: recentOrder.id,
                  productId: existingItem.productId,
                },
              },
              data: { qty: existingItem.qty + item.qty },
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
                costPrice: item.costPrice,
                shippingPrice: item.shippingPrice,
              },
            });
          }
        }

        // Recalculate Total Price
        const updatedItems = await tx.orderItem.findMany({
          where: { orderId: recentOrder.id },
        });

        // Items Price
        const newItemsPrice = updatedItems.reduce(
          (acc, item) => acc + Number(item.price) * item.qty,
          0,
        );

        // Flat Shipping
        const newShippingPrice =
          updatedItems.length > 0
            ? Math.max(
                ...updatedItems.map((item) => Number(item.shippingPrice)),
              )
            : 0;

        const newTotalPrice = newItemsPrice + newShippingPrice;
        const newQuantity = updatedItems.reduce(
          (acc, item) => acc + item.qty,
          0,
        );

        await tx.order.update({
          where: { id: recentOrder.id },
          data: {
            totalPrice: newTotalPrice,
            shippingPrice: newShippingPrice,
            quantity: newQuantity,
            fullName: orderData.fullName,
            governorate: orderData.governorate,
            address: orderData.address,
            actualShippingCost: await getActualShippingCost(
              orderData.governorate,
            ),
            userId: userId ?? recentOrder.userId,
          },
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
    const ip = (await headers()).get("x-forwarded-for");

    // Check for fraud
    // Exempt Admin and Employees
    const isAdminOrEmployee =
      session?.user?.role === "admin" || session?.user?.role === "employee";
    const isFraud = isAdminOrEmployee
      ? false
      : await checkForFraud(
          ip as string,
          orderData.phoneNumber,
          orderData.governorate,
        );

    // Create a transaction to create order and order items in database
    const insertedOrderId = await prisma.$transaction(async (tx) => {
      // Create order
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { selectedColor, ...orderDataWithoutColor } = orderData;
      const insertedOrder = await tx.order.create({
        data: {
          ...orderDataWithoutColor,
          totalPrice: price,
          shippingPrice: shippingPrice,
          userId,
          status: isFraud ? "banned" : "home",
          actualShippingCost: await getActualShippingCost(
            orderData.governorate,
          ),
          ip: ip as string,
        },
      });
      // Create order items from the cart items
      for (const item of cart.items as CartItem[]) {
        await tx.orderItem.create({
          data: {
            orderId: insertedOrder.id,
            productId: item.productId,
            slug: item.slug,
            name: item.name,
            qty: item.qty,
            image: item.image,
            price: item.price,
            costPrice: item.costPrice,
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
      redirectTo: isFraud
        ? "https://www.facebook.com"
        : `/order-completed/${insertedOrderId}`, // Use order-completed for typical checkout? Or thank-you?
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
      orderitems: {
        include: {
          product: { select: { categories: true } },
        },
      },
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
  sort,
}: {
  limit?: number;
  page: number;
  query: string;
  status?: string;
  sort?: string;
}) {
  const queryFilter: Prisma.OrderWhereInput =
    query && query !== "all"
      ? {
          OR: [
            { fullName: { contains: query, mode: "insensitive" } },
            { phoneNumber: { contains: query, mode: "insensitive" } },
            { address: { contains: query, mode: "insensitive" } },
            { governorate: { contains: query, mode: "insensitive" } },
            { deliveryTrackingId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {};

  if (status && status !== "all") {
    (queryFilter as any).status = status;
  }

  // Handle Product Sorting
  if (sort === "product") {
    // 1. Fetch all matching orders with their items (lightweight)
    const allMatching = await prisma.order.findMany({
      where: { ...queryFilter },
      select: {
        id: true,
        orderitems: {
          select: { name: true },
          take: 1,
        },
      },
    });

    // 2. Sort in memory
    allMatching.sort((a, b) => {
      const nameA = a.orderitems[0]?.name || "";
      const nameB = b.orderitems[0]?.name || "";
      return nameA.localeCompare(nameB, "ar");
    });

    // 3. Paginate
    const totalCount = allMatching.length;
    const startIndex = (page - 1) * limit;
    const slicedIds = allMatching
      .slice(startIndex, startIndex + limit)
      .map((o) => o.id);

    // 4. Fetch full data for the page
    // Note: findMany with 'in' does NOT guarantee order. We must re-sort manually.
    const pageData = await prisma.order.findMany({
      where: { id: { in: slicedIds } },
      include: { orderitems: true },
    });

    // Re-sort to match the sliced order
    const sortedPageData = slicedIds.map(
      (id) => pageData.find((o) => o.id === id)!,
    );

    return {
      data: convertToPlainObject(sortedPageData),
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  // Default Sorting (Date)
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

  const dataCount = await prisma.order.count({ where: queryFilter });
  return {
    data: convertToPlainObject(data),
    totalPages: Math.ceil(dataCount / limit),
  };
}

// Get All Orders For Export (No Pagination)
// Get All Orders For Export (No Pagination)
export async function getAllOrdersForExport({
  query,
  status,
  sort,
}: {
  query: string;
  status?: string;
  sort?: string;
}) {
  const queryFilter: Prisma.OrderWhereInput =
    query && query !== "all"
      ? {
          OR: [
            { fullName: { contains: query, mode: "insensitive" } },
            { phoneNumber: { contains: query, mode: "insensitive" } },
            { address: { contains: query, mode: "insensitive" } },
            { governorate: { contains: query, mode: "insensitive" } },
            { deliveryTrackingId: { contains: query, mode: "insensitive" } },
          ],
        }
      : {};

  if (status && status !== "all") {
    (queryFilter as any).status = status;
  }

  const data = await prisma.order.findMany({
    where: {
      ...queryFilter,
    },
    orderBy: { createdAt: "desc" },
    include: {
      orderitems: true,
    },
  });

  if (sort === "product") {
    data.sort((a, b) => {
      const nameA = a.orderitems[0]?.name || "";
      const nameB = b.orderitems[0]?.name || "";
      return nameA.localeCompare(nameB, "ar");
    });
  }

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
    const res = await prisma.order.findFirst({
      where: { id },
    });
    if (res?.status === "delete") {
      await prisma.order.delete({
        where: { id },
      });
    } else {
      await prisma.order.update({
        where: { id },
        data: {
          status: "delete",
        },
      });
    }

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

    // جلب بيانات الطلب الحالية (للتحقق من معرّف التوصيل والحالة)
    const existingOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        status: true,
        deliveryTrackingId: true,
        fullName: true,
        phoneNumber: true,
        governorate: true,
        quantity: true,
        totalPrice: true,
        notes: true,
        address: true,
        orderitems: {
          select: { name: true },
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      // Update each OrderItem qty if provided
      if (order.orderItems && order.orderItems.length > 0) {
        for (const item of order.orderItems) {
          await tx.orderItem.update({
            where: {
              orderId_productId: {
                orderId: order.id,
                productId: item.productId,
              },
            },
            data: { qty: item.qty },
          });
        }
      }

      // Recalculate total quantity from updated items
      const updatedItems = await tx.orderItem.findMany({
        where: { orderId: order.id },
      });
      const newQuantity = updatedItems.reduce((sum, i) => sum + i.qty, 0);

      const enteringPending =
        order.status === "pending" && existingOrder?.status !== "pending";

      await tx.order.update({
        where: { id: order.id },
        data: {
          fullName: order.fullName,
          phoneNumber: order.phoneNumber,
          governorate: order.governorate,
          address: order.address,
          quantity: newQuantity,
          totalPrice: order.totalPrice,
          shippingPrice: order.shippingPrice,
          status: order.status,
          notes: order.notes,
          actualShippingCost: order.actualShippingCost,
          ...(order.deliveryTrackingId !== undefined && {
            deliveryTrackingId: order.deliveryTrackingId || null,
          }),
          ...(enteringPending && {
            deliveryTrackingId: null,
            deliverySentAt: null,
          }),
        },
      });
    });

    // ── إرسال تلقائي لشركة التوصيل عند الانتقال إلى "pending" ──
    if (order.status === "pending" && existingOrder?.status !== "pending") {
      const input = buildDeliveryInput({
        id: order.id,
        fullName: order.fullName ?? existingOrder?.fullName,
        phoneNumber: order.phoneNumber ?? existingOrder?.phoneNumber,
        governorate: order.governorate ?? existingOrder?.governorate,
        address: order.address ?? existingOrder?.address,
        quantity: existingOrder?.quantity,
        totalPrice: order.totalPrice ?? existingOrder?.totalPrice,
        notes: order.notes ?? existingOrder?.notes,
        orderitems: existingOrder?.orderitems,
      });

      const result = await getDeliveryProvider().sendOrder(input);
      if (result.success && result.trackingId) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            deliveryTrackingId: result.trackingId,
            deliverySentAt: new Date(),
          },
        });
      }
    }

    revalidatePath("/admin/orders");
    // WhatsApp: رسالة الطلب الراجع (كانت عبر n8n سابقاً)
    if (order.status === "returned" && existingOrder?.status !== "returned") {
      try {
        const productNames =
          existingOrder?.orderitems?.map((i: any) => i.name).join(" + ") ?? "";
        const price = order.totalPrice ?? existingOrder?.totalPrice ?? 0;

        await sendOrderReturned({
          fullName: order.fullName ?? existingOrder?.fullName ?? "",
          phoneNumber:
            order.phoneNumber ?? existingOrder?.phoneNumber ?? "",
          product: productNames,
          price: price.toString(),
        });
      } catch (err) {
        console.error("❌ WhatsApp returned order error:", err);
      }
    }

    return {
      success: true,
      message: "Order Updated Successfully",
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}

// Bulk Update Order Status
export async function bulkUpdateOrderStatus(ids: string[], status: string) {
  try {
    // ── أولاً: حدّث الحالة في قاعدة البيانات لجميع الطلبات ──
    await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    // ── ثانياً: إن كانت الحالة الجديدة "pending" → أرسل لمدن ──
    let modonSent = 0;
    let modonFailed = 0;

    if (status === "pending") {
      // مسح بيانات التوصيل القديمة لإعادة الإرسال دائماً
      await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { deliveryTrackingId: null, deliverySentAt: null },
      });

      const ordersToSend = await prisma.order.findMany({
        where: {
          id: { in: ids },
        },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          governorate: true,
          address: true,
          quantity: true,
          totalPrice: true,
          notes: true,
          orderitems: {
            select: { name: true, qty: true },
          },
        },
      });

      // ترتيب الطلبات حسب اسم المنتج الأول قبل الإرسال
      ordersToSend.sort((a, b) => {
        const nameA = a.orderitems?.[0]?.name ?? "";
        const nameB = b.orderitems?.[0]?.name ?? "";
        return nameA.localeCompare(nameB, "ar");
      });

      // إرسال بالتسلسل للحفاظ على الترتيب في نظام شركة التوصيل
      const provider = getDeliveryProvider();
      const results: { success: boolean }[] = [];
      for (const o of ordersToSend) {
        const result = await provider.sendOrder(buildDeliveryInput(o));
        if (result.success && result.trackingId) {
          await prisma.order.update({
            where: { id: o.id },
            data: {
              deliveryTrackingId: result.trackingId,
              deliverySentAt: new Date(),
            },
          });
          results.push({ success: true });
        } else {
          results.push({ success: false });
        }
      }

      modonSent = results.filter((r) => r.success).length;
      modonFailed = results.length - modonSent;
    }

    revalidatePath("/admin/orders");

    // WhatsApp: رسائل الطلبات الراجعة (كانت عبر n8n سابقاً)
    if (status === "returned") {
      const returnedOrders = await prisma.order.findMany({
        where: { id: { in: ids } },
        select: {
          fullName: true,
          phoneNumber: true,
          totalPrice: true,
          orderitems: { select: { name: true } },
        },
      });

      for (const o of returnedOrders) {
        try {
          const productNames =
            o.orderitems?.map((i: any) => i.name).join(" + ") ?? "";

          await sendOrderReturned({
            fullName: o.fullName ?? "",
            phoneNumber: o.phoneNumber ?? "",
            product: productNames,
            price: o.totalPrice?.toString() ?? "0",
          });
        } catch (err) {
          console.error("❌ WhatsApp returned order error:", err);
        }
      }
    }
    const baseMsg = `تم تحديث ${ids.length} طلب بنجاح.`;
    const modonMsg =
      status === "pending" && modonSent + modonFailed > 0
        ? ` التوصيل: ✅ ${modonSent} أُرسل، ❌ ${modonFailed} فشل.`
        : "";

    return {
      success: true,
      message: baseMsg + modonMsg,
      modonSent,
      modonFailed,
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}

// إعادة إرسال طلب واحد لمدن يدوياً (للطلبات التي فشل إرسالها)
export async function resendOrderToModon(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        governorate: true,
        address: true,
        quantity: true,
        totalPrice: true,
        notes: true,
        deliveryTrackingId: true,
        status: true,
        orderitems: {
          select: { name: true, qty: true },
        },
      },
    });

    if (!order) return { success: false, message: "الطلب غير موجود" };
    if (order.deliveryTrackingId)
      return { success: false, message: "الطلب مُرسل لشركة التوصيل مسبقاً" };

    const result = await getDeliveryProvider().sendOrder(
      buildDeliveryInput(order),
    );

    if (result.success && result.trackingId) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          deliveryTrackingId: result.trackingId,
          deliverySentAt: new Date(),
        },
      });
      revalidatePath("/admin/orders");
      return { success: true, message: "✅ تم الإرسال لشركة التوصيل بنجاح" };
    }

    const errorMsg = result.error || "خطأ غير معروف في البيانات المدخلة";
    return {
      success: false,
      message: `❌ التوصيل: ${errorMsg}`,
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError };
  }
}

// Count Orders By Date Range And Status (preview before bulk update)
export async function countOrdersByDateAndStatus({
  from,
  to,
  fromStatus,
}: {
  from: Date;
  to: Date;
  fromStatus: string;
}) {
  const toLocalMidnight = (d: Date, endOfDay: boolean) => {
    const iso = d.toISOString().split("T")[0];
    const [y, m, day] = iso.split("-").map(Number);
    if (endOfDay) return new Date(Date.UTC(y, m - 1, day, 20, 59, 59, 999));
    return new Date(Date.UTC(y, m - 1, day - 1, 21, 0, 0, 0));
  };
  const startDate = toLocalMidnight(new Date(from), false);
  const endDate = toLocalMidnight(new Date(to), true);

  const count = await prisma.order.count({
    where: {
      status: fromStatus,
      createdAt: { gte: startDate, lte: endDate },
    },
  });
  return count;
}

// Bulk Update Order Status By Date Range
export async function bulkUpdateOrderStatusByDateRange({
  from,
  to,
  fromStatus,
  toStatus,
}: {
  from: Date;
  to: Date;
  fromStatus: string;
  toStatus: string;
}) {
  try {
    // Parse date string as local Iraq time (UTC+3)
    const toLocalMidnight = (d: Date, endOfDay: boolean) => {
      const iso = d.toISOString().split("T")[0]; // "YYYY-MM-DD"
      const [y, m, day] = iso.split("-").map(Number);
      // Iraq is UTC+3, so midnight local = 21:00 previous day UTC
      // end of day local = 20:59:59 UTC same day
      if (endOfDay) {
        return new Date(Date.UTC(y, m - 1, day, 20, 59, 59, 999)); // 23:59:59 Iraq
      }
      return new Date(Date.UTC(y, m - 1, day - 1, 21, 0, 0, 0)); // 00:00:00 Iraq
    };

    const startDate = toLocalMidnight(new Date(from), false);
    const endDate = toLocalMidnight(new Date(to), true);

    const result = await prisma.order.updateMany({
      where: {
        status: fromStatus,
        createdAt: { gte: startDate, lte: endDate },
      },
      data: { status: toStatus },
    });

    revalidatePath("/admin/orders");
    return { success: true, count: result.count };
  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError, count: 0 };
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

  // Get daily sales (last 30 days)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 29);
  const dailySalesDataRaw = await prisma.$queryRaw<
    Array<{ day: string; totalSales: Prisma.Decimal }>
  >`SELECT to_char("createdAt", 'DD/MM') as "day", sum("totalPrice") as "totalSales" FROM "Order" WHERE "createdAt" >= ${thirtyDaysAgo} GROUP BY to_char("createdAt", 'DD/MM'), date_trunc('day', "createdAt") ORDER BY min("createdAt")`;

  const dailySalesData = dailySalesDataRaw.map((item) => ({
    month: item.day,
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
        status: { not: "Cancelled" },
      },
    },
    select: {
      price: true,
      qty: true,
      costPrice: true,
    },
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
  const prevMonthOrders = await getCount(
    prisma.order,
    previousMonthStart,
    previousMonthEnd,
  );
  const ordersChange =
    prevMonthOrders === 0
      ? currentMonthOrders * 100
      : ((currentMonthOrders - prevMonthOrders) / prevMonthOrders) * 100;

  // 2. Users
  const currentMonthUsers = await getCount(prisma.user, currentMonthStart);
  const prevMonthUsers = await getCount(
    prisma.user,
    previousMonthStart,
    previousMonthEnd,
  );
  const usersChange =
    prevMonthUsers === 0
      ? currentMonthUsers * 100
      : ((currentMonthUsers - prevMonthUsers) / prevMonthUsers) * 100;

  // 3. Products
  const currentMonthProducts = await getCount(
    prisma.product,
    currentMonthStart,
  );
  const prevMonthProducts = await getCount(
    prisma.product,
    previousMonthStart,
    previousMonthEnd,
  );
  const productsChange =
    prevMonthProducts === 0
      ? currentMonthProducts * 100
      : ((currentMonthProducts - prevMonthProducts) / prevMonthProducts) * 100;

  // 4. Revenue (Sales)
  const currentMonthRevenue = await getSalesSum(currentMonthStart);
  const prevMonthRevenue = await getSalesSum(
    previousMonthStart,
    previousMonthEnd,
  );
  const revenueChange =
    prevMonthRevenue === 0
      ? currentMonthRevenue * 100
      : ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;

  return {
    ordersCount: currentMonthOrders,
    productsCount: currentMonthProducts,
    usersCount: currentMonthUsers,
    totalSales: currentMonthRevenue,
    totalProfit,
    salesData,
    dailySalesData,
    latestOrders,
    statsChange: {
      orders: Math.round(ordersChange),
      users: Math.round(usersChange),
      products: Math.round(productsChange),
      revenue: Math.round(revenueChange),
    },
  };
}

// Get Order Profit Stats
export async function getOrderProfitStats({
  from,
  to,
}: {
  from: Date;
  to: Date;
}) {
  // Iraq is UTC+3: midnight local = 21:00 prev day UTC, end of day = 20:59:59 UTC
  const toIraqDay = (d: Date, endOfDay: boolean) => {
    const iso = new Date(d).toISOString().split("T")[0];
    const [y, m, day] = iso.split("-").map(Number);
    if (endOfDay) return new Date(Date.UTC(y, m - 1, day, 20, 59, 59, 999));
    return new Date(Date.UTC(y, m - 1, day - 1, 21, 0, 0, 0));
  };
  const startDate = toIraqDay(from, false);
  const endDate = toIraqDay(to, true);

  const [orders, returnedOrders] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        // Revenue only — `pending` is excluded here on purpose (goods shipped but
        // cash not collected). Inventory consumption uses the wider list.
        status: { in: REVENUE_STATUSES },
      },
      select: {
        id: true,
        createdAt: true,
        totalPrice: true,
        shippingPrice: true,
        actualShippingCost: true,
        governorate: true,
        orderitems: {
          select: {
            productId: true,
            name: true,
            qty: true,
            price: true,
            costPrice: true,
            shippingPrice: true,
          },
        },
      },
    }),
    prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ["returned", "returnReceived"] },
      },
      select: {
        orderitems: {
          select: { productId: true, qty: true },
        },
      },
    }),
  ]);

  // Build returned qty map per product
  const returnedQtyMap = new Map<string, number>();
  for (const order of returnedOrders) {
    for (const item of order.orderitems) {
      returnedQtyMap.set(
        item.productId,
        (returnedQtyMap.get(item.productId) ?? 0) + item.qty,
      );
    }
  }

  // FEFO cost layer: for products that have batches, the cost of goods sold is
  // derived from batches (earliest-expiry first) instead of the frozen snapshot.
  // Only sales created on/after a product's first batch use FEFO; older sales
  // keep their snapshot cost so historical numbers never change.
  const productIdsInRange = Array.from(
    new Set(orders.flatMap((o) => o.orderitems.map((i) => i.productId))),
  );
  const fefoContexts = await buildFefoContexts(productIdsInRange);
  const fefoActive = fefoContexts.size > 0;
  let fefoFallbackQty = 0;

  const statsMap = new Map<
    string,
    {
      productId: string;
      name: string;
      totalQty: number;
      totalRevenue: number;
      totalCost: number;
      totalProfit: number;
      orderCount: number;
      returnedQty: number;
    }
  >();

  let totalGrossRevenue = 0; // sum(Order.totalPrice)
  let totalActualShippingCost = 0; // sum(Order.actualShippingCost)
  let baghdadOrderCount = 0;
  let othersOrderCount = 0;
  let baghdadActualShippingCost = 0;
  let othersActualShippingCost = 0;

  for (const order of orders) {
    const orderItems = order.orderitems;
    const isBaghdad = order.governorate === "Baghdad";
    const actualShipping = Number(order.actualShippingCost);

    if (isBaghdad) {
      baghdadOrderCount++;
      baghdadActualShippingCost += actualShipping;
    } else {
      othersOrderCount++;
      othersActualShippingCost += actualShipping;
    }

    totalGrossRevenue += Number(order.totalPrice);
    totalActualShippingCost += actualShipping;

    // Net product revenue = what was collected - actual delivery cost paid to courier
    // This is the "true" revenue: product price + shipping margin (positive or negative)
    const orderNetRevenue = Number(order.totalPrice) - actualShipping;

    // Distribute proportionally among items (handles multi-product + bundle discounts)
    const rawItemsTotal = orderItems.reduce(
      (sum, i) => sum + Number(i.price) * i.qty,
      0,
    );

    for (const item of orderItems) {
      const rawRevenue = Number(item.price) * item.qty;
      const revenue =
        rawItemsTotal > 0
          ? (rawRevenue / rawItemsTotal) * orderNetRevenue
          : rawRevenue;

      // Default to the frozen snapshot cost; override with FEFO when available.
      let cost = Number(item.costPrice) * item.qty;
      const ctx = fefoContexts.get(item.productId);
      if (ctx && new Date(order.createdAt) >= ctx.fefoStart) {
        const key = saleKey(order.id, item.productId);
        const fefoCost = ctx.saleCost.get(key);
        if (fefoCost !== undefined) {
          cost = fefoCost;
          fefoFallbackQty += ctx.saleFallbackQty.get(key) ?? 0;
        }
      }

      const profit = revenue - cost;

      if (statsMap.has(item.productId)) {
        const stats = statsMap.get(item.productId)!;
        stats.totalQty += item.qty;
        stats.totalRevenue += revenue;
        stats.totalCost += cost;
        stats.totalProfit += profit;
        stats.orderCount += 1;
      } else {
        statsMap.set(item.productId, {
          productId: item.productId,
          name: item.name,
          totalQty: item.qty,
          totalRevenue: revenue,
          totalCost: cost,
          totalProfit: profit,
          orderCount: 1,
          returnedQty: 0,
        });
      }
    }
  }

  // Attach returned qty to each product stat
  for (const [productId, returnedQty] of returnedQtyMap) {
    const stat = statsMap.get(productId);
    if (stat) {
      stat.returnedQty = returnedQty;
    } else {
      // Product had returns but no completed sales in range — include it
      statsMap.set(productId, {
        productId,
        name: "",
        totalQty: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        orderCount: 0,
        returnedQty,
      });
    }
  }

  const productStats = Array.from(statsMap.values()).sort(
    (a, b) => b.totalProfit - a.totalProfit,
  );

  const totalOrderCount = baghdadOrderCount + othersOrderCount;
  const avgOrderValue =
    totalOrderCount > 0 ? totalGrossRevenue / totalOrderCount : 0;

  return {
    productStats,
    fefoActive,
    fefoFallbackQty,
    orderSummary: {
      totalOrderCount,
      baghdadOrderCount,
      othersOrderCount,
      avgOrderValue,
      totalGrossRevenue,
      totalActualShippingCost,
      baghdadActualShippingCost,
      othersActualShippingCost,
    },
  };
}

// ── مزامنة حالات طلبات مدن ──
export async function syncModonOrders() {
  try {
    // جلب جميع الطلبات المحلية التي لديها معرّف تتبّع وليست مكتملة/راجعة نهائياً
    const localOrders = await prisma.order.findMany({
      where: {
        deliveryTrackingId: { not: null },
        status: { notIn: ["completed", "returnReceived"] },
      },
      select: { id: true, deliveryTrackingId: true, status: true },
    });

    if (localOrders.length === 0) {
      return {
        success: false,
        message: "لا توجد طلبات للمزامنة",
        updatedOrders: 0,
      };
    }

    const remoteOrders = await getDeliveryProvider().fetchRemoteOrders(
      localOrders.map((o) => String(o.deliveryTrackingId)),
    );

    // فهرسة الطلبات البعيدة حسب معرّف التتبّع لتسريع المطابقة
    const byTrackingId = new Map(remoteOrders.map((o) => [o.trackingId, o]));

    let updatedCount = 0;

    for (const localOrder of localOrders) {
      const remote = byTrackingId.get(String(localOrder.deliveryTrackingId));
      if (!remote || !remote.localStatus) continue;

      if (remote.localStatus !== localOrder.status) {
        const updateData: Prisma.OrderUpdateInput = {
          status: remote.localStatus,
        };
        if (remote.localStatus === "completed" && remote.collectedPrice != null) {
          updateData.deliveryCollectedPrice = remote.collectedPrice / 1000;
        }
        await prisma.order.update({
          where: { id: localOrder.id },
          data: updateData,
        });
        updatedCount++;
      }
    }

    revalidatePath("/admin/orders");
    return {
      success: true,
      message: `تم التزامن وتحديث حالة ${updatedCount} طلب بنجاح.`,
      updatedOrders: updatedCount,
    };
  } catch (error) {
    const { success, formError } = formatError(error);
    return { success, message: formError, updatedOrders: 0 };
  }
}

// Import Orders from Excel
export async function importOrders(data: any[]) {
  try {
    if (!data || data.length === 0) {
      return { success: false, message: "No data found in file" };
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Governorate Mapping (Arabic -> English Keys)
    const governorateMap: { [key: string]: string } = {
      بغداد: "Baghdad",
      البصرة: "Basra",
      نينوى: "Nineveh",
      الموصل: "Nineveh",
      أربيل: "Erbil",
      اربيل: "Erbil",
      كركوك: "Kirkuk",
      السليمانية: "Sulaymaniyah",
      ديالى: "Diyala",
      بابل: "Babylon",
      الحلة: "Babylon",
      الأنبار: "Anbar",
      الانبار: "Anbar",
      "ذي قار": "Dhi Qar",
      الناصرية: "Dhi Qar",
      كربلاء: "Karbala",
      النجف: "Najaf",
      واسط: "Wasit",
      الكوت: "Wasit",
      القادسية: "Qadisiyah",
      الديوانية: "Qadisiyah",
      ميسان: "Maysan",
      العمارة: "Maysan",
      المثنى: "Muthanna",
      السماوة: "Muthanna",
      "صلاح الدين": "Saladin",
      دهوك: "Dohuk",
    };

    let successCount = 0;

    // Process each row
    for (const row of data) {
      // 1. Extract & Map Data
      const fullName = row["اسم الزبون"] || "Unknown";
      const phoneNumber = row["رقم الزبون"] || row["رقم الهاتف"] || "";
      const govArabic = row["المحافظة"] || "";
      const governorate = governorateMap[govArabic] || govArabic || "Baghdad"; // Fallback
      const address = row["اقرب نقطة دالة"] || "";
      const notes = row["الملاحظات"] || "";
      const totalPrice = Number(row["السعر مع التوصيل"]) / 1000 || 0;
      const qty = Number(row["عدد القطع"]) || 1;
      const productName = row["اسم المنتج"] || "";

      // 2. Find Product (Best Effort)
      let product = null;
      if (productName) {
        // Try exact match first
        product = await prisma.product.findFirst({
          where: { name: { equals: productName, mode: "insensitive" } },
        });

        // Try contains if not found (take the first one)
        if (!product) {
          const firstPart = productName.split(",")[0].trim();
          if (firstPart) {
            product = await prisma.product.findFirst({
              where: { name: { contains: firstPart, mode: "insensitive" } },
            });
          }
        }
      }

      if (product) {
        // Calculate price from DB if not provided or to match user request "fetch price"
        // If "السعر مع التوصيل" in Excel is roughly (price * qty), we might prefer DB for accuracy.
        // Assuming "add product price to the table" means use the DB price.

        const itemPrice = Number(product.price);
        const shipping = Number(product.shippingPrice);
        // If totalPrice from Excel is 0, use calculated.
        // Or just overwrite? The user said "fetch the price ... and add it".
        // I'll prefer the calculated price to ensure it matches the product in DB.
        const calculatedTotalPrice = itemPrice * qty + shipping;

        const finalTotalPrice =
          totalPrice > 0 ? totalPrice : calculatedTotalPrice;

        await prisma.$transaction(async (tx) => {
          // Create Order
          const order = await tx.order.create({
            data: {
              userId: userId,
              fullName,
              phoneNumber: String(phoneNumber),
              governorate,
              address,
              notes,
              totalPrice: finalTotalPrice,
              shippingPrice: shipping,
              status: "home",
              quantity: qty,
              actualShippingCost: await getActualShippingCost(governorate),
            },
          });

          // Create Order Item
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: product.id,
              slug: product.slug,
              name: product.name,
              price: product.price,
              costPrice: product.costPrice,
              qty: qty,
              image: product.images[0] || "",
              shippingPrice: product.shippingPrice,
            },
          });
        });
        successCount++;
      }
    }

    revalidatePath("/admin/orders");
    return { success: true, count: successCount, message: "Done" };
  } catch (error) {
    console.error("Import Error:", error);
    return { success: false, message: "Failed to process file" };
  }
}

// ── إحصائيات مدن ──
export async function getModonStats() {
  const MODON_STATUSES = [
    "pending",
    "completed",
    "returned",
    "returnReceived",
    "rescheduled",
    "failed",
  ];

  // جلب طلباتنا التي أُرسلت لشركة التوصيل (لديها معرّف تتبّع)
  const [localOrders, priceDiffs, dailySent] = await Promise.all([
    prisma.order.findMany({
      where: { deliveryTrackingId: { not: null } },
      select: {
        id: true,
        deliveryTrackingId: true,
        status: true,
        fullName: true,
        phoneNumber: true,
        createdAt: true,
      },
    }),

    prisma.order.findMany({
      where: { status: "completed", deliveryCollectedPrice: { not: null } },
      select: { totalPrice: true, deliveryCollectedPrice: true },
    }),

    prisma.order.findMany({
      where: {
        deliverySentAt: {
          not: null,
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      select: { deliverySentAt: true },
    }),
  ]);

  // مدن تتجاهل المعرّفات وتجلب الكل؛ برايم يستعلم بها (shipments-info).
  const remoteOrders = await getDeliveryProvider().fetchRemoteOrders(
    localOrders.map((o) => String(o.deliveryTrackingId)),
  );

  // إحصائيات الحالات (فقط طلبات أُرسلت لشركة التوصيل)
  const counts: Record<string, number> = {};
  for (const s of MODON_STATUSES) counts[s] = 0;
  for (const o of localOrders) {
    if (counts[o.status] !== undefined) counts[o.status]++;
  }
  const totalSentToModon = localOrders.length;

  // مقارنة: طلباتنا ذات المعرّف vs طلبات شركة التوصيل
  const localQrIds = new Set(
    localOrders.map((o) => String(o.deliveryTrackingId)),
  );
  const modonIds = new Set(remoteOrders.map((o) => o.trackingId));

  // موجودة عندنا لكن مفقودة من شركة التوصيل
  const missingInModon = localOrders.filter(
    (o) => !modonIds.has(String(o.deliveryTrackingId)),
  );

  // موجودة لدى شركة التوصيل لكن مفقودة من نظامنا
  const missingInLocal = remoteOrders.filter(
    (o) => !localQrIds.has(o.trackingId),
  );

  // مقارنة الأسعار
  const priceStats = priceDiffs.reduce(
    (acc, o) => {
      const expected = Number(o.totalPrice);
      const collected = Number(o.deliveryCollectedPrice);
      acc.total++;
      if (collected < expected) {
        acc.less++;
        acc.lossAmount += expected - collected;
      } else if (collected > expected) {
        acc.more++;
        acc.gainAmount += collected - expected;
      } else acc.exact++;
      return acc;
    },
    { total: 0, exact: 0, less: 0, more: 0, lossAmount: 0, gainAmount: 0 },
  );

  // تجميع يومي
  const dailyMap: Record<string, number> = {};
  for (const o of dailySent) {
    const localDate = new Date(o.deliverySentAt!.getTime() + 3 * 60 * 60 * 1000);
    const day = localDate.toISOString().slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + 1;
  }
  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return convertToPlainObject({
    counts,
    totalSentToModon,
    totalInModon: modonIds.size,
    missingInModon: missingInModon.map((o) => ({
      id: o.id,
      modonQrId: o.deliveryTrackingId,
      fullName: o.fullName,
      phoneNumber: o.phoneNumber,
      status: o.status,
      createdAt: o.createdAt,
    })),
    missingInLocal: missingInLocal.map((o) => ({
      modonId: o.trackingId,
      clientName: o.clientName ?? "-",
      phone: o.phone ?? "-",
      statusId: o.rawStatus,
    })),
    priceStats,
    daily,
  });
}
