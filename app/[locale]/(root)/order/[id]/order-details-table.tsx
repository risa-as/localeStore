"use client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime, formatId } from "@/lib/utils";
import { Order } from "@/types";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from "react";
import { deliverOrder } from "@/lib/actions/order.actions";
import { useTranslations } from "next-intl";

const OrderDetailsTable = ({
  order,
  isAdmin,
}: {
  order: Order;
  isAdmin: boolean;
}) => {
  const {
    id,
    orderitems,
    fullName,
    phoneNumber,
    governorate,
    address,
    status,
    createdAt,
    quantity
  } = order as any; // Cast to any because Order type in types/index.ts might be strictly z.infer which misses some fields if not fully aligned yet, or simply to access new fields safely.

  const t = useTranslations('Checkout'); // Re-using Checkout translations or Admin?
  const { toast } = useToast();

  // Calculate totals locally since they are not in DB
  const itemsPrice = orderitems.reduce((acc: number, item: any) => acc + (Number(item.price) * item.qty), 0);

  // Button to mark order as delivered/completed
  const MarkAsDeliveredButton = () => {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    return (
      <Button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await deliverOrder(order.id);
            toast({
              variant: res.success ? "default" : "destructive",
              description: res.message,
            });
          })
        }
      >
        {isPending ? "processing..." : "Mark As Delivered"}
      </Button>
    );
  };

  return (
    <>
      <h1 className="py-4 text-2xl">Order {formatId(id)}</h1>
      <div className="grid md:grid-cols-3 md:gap-5">
        <div className="col-span-2 space-y-4 overflow-x-auto">
          <Card>
            <CardContent className="p-4 gap-4">
              <h2 className="text-xl pb-4">Customer Details</h2>
              <p><strong>Name:</strong> {fullName}</p>
              <p><strong>Phone:</strong> {phoneNumber}</p>
              <div className="flex items-center gap-2"><strong>Status:</strong> <Badge variant={status === 'Delivered' ? 'default' : 'secondary'}>{status}</Badge></div>
              <p><strong>Date:</strong> {formatDateTime(createdAt).dateTime}</p>
            </CardContent>
          </Card>
          <Card className="my-2">
            <CardContent className="p-4 gap-4">
              <h2 className="text-xl pb-4">Shipping Address</h2>
              <p>
                {governorate}, {address}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 gap-4">
              <h2 className="text-xl pb-4">Order Items</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderitems.map((item: any) => (
                    <TableRow key={item.slug}>
                      <TableCell>
                        <Link
                          href={`/product/${item.slug}`}
                          className="flex items-center"
                        >
                          <Image
                            src={item.image}
                            alt={item.name}
                            width={50}
                            height={50}
                          />
                          <span className="px-2">{item.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="px-2">{item.qty}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardContent className="p-4 gap-4 space-y-4">
              <div className="flex justify-between">
                <div>Total Items</div>
                <div>{quantity}</div>
              </div>
              <div className="flex justify-between">
                <div>Total Price</div>
                <div>{formatCurrency(itemsPrice)}</div>
              </div>

              {/* Actions */}
              {isAdmin && status !== 'completed' && (
                <MarkAsDeliveredButton />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default OrderDetailsTable;
