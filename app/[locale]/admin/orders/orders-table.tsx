"use client";

import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime, formatId, formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { bulkUpdateOrderStatus, deleteOrder } from "@/lib/actions/order.actions";
import DeleteDialog from "@/components/shared/delete-dialog";
import { PAGE_SIZE } from "@/lib/constants";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import UpdateOrderForm from "./update-order-form";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, Pencil, Eye, MessageCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export default function OrdersTable({
    orders,
    page,
    count,
    sort,
}: {
    orders: any[];
    page: number;
    count: number;
    sort?: string;
}) {
    const t = useTranslations("Admin");

    // ... existing hooks ...
    const tGov = useTranslations("Governorates");
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

    const createSortUrl = (key: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (params.get("sort") === key) {
            params.delete("sort");
        } else {
            params.set("sort", key);
        }
        return `?${params.toString()}`;
    };

    const [isPending, startTransition] = useTransition();
    const [editingOrder, setEditingOrder] = useState<any | null>(null);
    const [openEdit, setOpenEdit] = useState(false);

    // Toggle all
    const toggleAll = (checked: boolean) => {
        if (checked) {
            setSelectedOrders(orders.map((o) => o.id));
        } else {
            setSelectedOrders([]);
        }
    };

    // Toggle single
    const toggleOrder = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedOrders((prev) => [...prev, id]);
        } else {
            setSelectedOrders((prev) => prev.filter((o) => o !== id));
        }
    };

    const isAllSelected =
        orders.length > 0 && selectedOrders.length === orders.length;

    const handleBulkUpdate = (status: string) => {
        startTransition(async () => {
            const res = await bulkUpdateOrderStatus(selectedOrders, status);
            if (res.success) {
                toast({
                    title: "Success",
                    description: res.message,
                });
                setSelectedOrders([]);
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: res.message,
                });
            }
        });
    };

    const statuses = ['home', 'account', 'pending', 'completed', 'returned', 'waiting', 'banned'];

    return (
        <div className="space-y-4">
            {/* Bulk Action Bar - kept same */}
            {selectedOrders.length > 0 && (
                <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md">
                    <span className="text-sm font-medium">
                        {selectedOrders.length} {t("Orders.selected")}
                    </span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={isPending}>
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Orders.moveTo")} <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            {statuses.map((status) => (
                                <DropdownMenuItem
                                    key={status}
                                    onClick={() => handleBulkUpdate(status)}
                                >
                                    {t(`Orders.Status.${status}`)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}

            <div className="overflow-x-auto rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px]">
                                <Checkbox
                                    checked={isAllSelected}
                                    onCheckedChange={toggleAll}
                                    aria-label="Select all"
                                    className="mx-2"
                                />
                            </TableHead>
                            <TableHead>{t("sequence")}</TableHead>
                            <TableHead>{t("date")}</TableHead>
                            <TableHead>{t("name")}</TableHead>
                            <TableHead>
                                <Link
                                    href={createSortUrl('product')}
                                    className={`flex items-center gap-1 hover:text-primary ${sort === 'product' ? 'text-primary font-bold' : ''}`}
                                    title={t("sortByProduct")}
                                >
                                    {t("product")}
                                    {sort === 'product' && <ChevronDown className="w-3 h-3" />}
                                </Link>
                            </TableHead>
                            <TableHead>{t("whatsapp")}</TableHead>
                            <TableHead>{t("phoneNumber")}</TableHead>
                            <TableHead>{t("governorate")}</TableHead>
                            <TableHead>{t("address")}</TableHead>
                            <TableHead>{t("quantity")}</TableHead>
                            <TableHead>{t("price")}</TableHead>
                            <TableHead>{t("notes")}</TableHead>
                            <TableHead>{t("status")}</TableHead>
                            <TableHead className="w-[100px]">{t("actions")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map((order, index) => (
                            <TableRow key={order.id} data-state={selectedOrders.includes(order.id) ? "selected" : undefined}>
                                <TableCell>
                                    <Checkbox
                                        checked={selectedOrders.includes(order.id)}
                                        onCheckedChange={(checked) =>
                                            toggleOrder(order.id, checked as boolean)
                                        }
                                        aria-label={`Select order ${order.id}`}
                                        className="mx-2"
                                    />
                                </TableCell>
                                <TableCell>{(page - 1) * PAGE_SIZE + index + 1}</TableCell>
                                <TableCell>
                                    {formatDateTime(order.createdAt).dateTime}
                                </TableCell>
                                <TableCell>{order.fullName}</TableCell>
                                <TableCell>
                                    {order.orderitems && order.orderitems.length > 0
                                        ? order.orderitems.map((item: any) => item.name).join(", ")
                                        : t("noItems")}
                                </TableCell>
                                <TableCell>
                                    <a
                                        href={`https://wa.me/${order.phoneNumber?.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                                        title={t("whatsapp")}
                                    >
                                        <MessageCircle className="w-5 h-5 fill-current" />
                                    </a>
                                </TableCell>
                                <TableCell>{order.phoneNumber}</TableCell>
                                <TableCell>{tGov(order.governorate as any)}</TableCell>
                                <TableCell>{order.address}</TableCell>
                                <TableCell>{order.quantity}</TableCell>
                                <TableCell>{formatCurrency(order.totalPrice)}</TableCell>
                                <TableCell className="max-w-[200px] truncate" title={order.notes || ""}>
                                    {order.notes || "-"}
                                </TableCell>
                                <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${order.status === 'completed' ? 'bg-green-100 text-green-800' :
                                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            order.status === 'returned' || order.status === 'banned' ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-800'
                                        }`}>
                                        {t(`Orders.Status.${order.status}`) || order.status}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        <Dialog open={openEdit && editingOrder?.id === order.id} onOpenChange={(open) => {
                                            setOpenEdit(open);
                                            if (open) setEditingOrder(order);
                                            else setEditingOrder(null);
                                        }}>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="icon" title={t("edit")}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle>{t("edit")}</DialogTitle>
                                                </DialogHeader>
                                                <UpdateOrderForm order={order} setOpen={setOpenEdit} />
                                            </DialogContent>
                                        </Dialog>

                                        <Button asChild variant="ghost" size="icon" title={t("details")}>
                                            <Link href={`/order/${order.id}`}>
                                                <span className="sr-only">{t("details")}</span>
                                                <Eye className="w-4 h-4" />
                                            </Link>
                                        </Button>
                                        <DeleteDialog id={order.id} action={deleteOrder} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
