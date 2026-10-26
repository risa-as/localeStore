import { transitionOrder } from "@/lib/orders/status-service";
import { prisma } from '@/db/prisma';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { formatError } from '@/lib/utils';
import { getDeliveryProvider } from '@/lib/delivery';
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
        await prisma.$transaction(async tx => {
          await transitionOrder(tx, localOrder.id, remote.localStatus!, "courier-sync");
          delete updateData.status;
          await tx.order.update({ where: { id: localOrder.id }, data: updateData });
        }, { timeout: 30000 });
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