import { auth } from "@/auth";
import ProfitDatePicker from "@/components/admin/profit-date-picker";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getOrderProfitStats } from "@/lib/actions/order.actions";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Profit Analysis",
};

const ProfitPage = async (props: {
    searchParams: Promise<{
        from: string;
        to: string;
    }>;
}) => {
    const session = await auth();
    if (session?.user?.role !== "admin") {
        redirect("/unauthorized");
    }

    const searchParams = await props.searchParams;

    const t = await getTranslations('Admin');

    // Default to current date if no date provided
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultFrom = searchParams.from ? new Date(searchParams.from) : startOfMonth;
    const defaultTo = searchParams.to ? new Date(searchParams.to) : now;

    const stats = await getOrderProfitStats({ from: defaultFrom, to: defaultTo });

    // Calculate totals
    const totals = stats.reduce(
        (acc: { totalQty: number; totalRevenue: number; totalCost: number; totalProfit: number }, item: { totalQty: number; totalRevenue: number; totalCost: number; totalProfit: number }) => ({
            totalQty: acc.totalQty + item.totalQty,
            totalRevenue: acc.totalRevenue + item.totalRevenue,
            totalCost: acc.totalCost + item.totalCost,
            totalProfit: acc.totalProfit + item.totalProfit,
        }),
        { totalQty: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 }
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="h2-bold">{t('profitAnalysis')}</h1>
                <ProfitDatePicker defaultFrom={defaultFrom} defaultTo={defaultTo} />
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('productName')}</TableHead>
                            <TableHead className="text-right">{t('quantitySold')}</TableHead>
                            <TableHead className="text-right">{t('revenue')}</TableHead>
                            <TableHead className="text-right">{t('cost')}</TableHead>
                            <TableHead className="text-right">{t('netProfit')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {stats.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center">
                                    {t('noData')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            stats.map((item: any) => (
                                <TableRow key={item.productId}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell className="text-right">{item.totalQty}</TableCell>
                                    <TableCell className="text-right">
                                        {formatCurrency(item.totalRevenue)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatCurrency(item.totalCost)}
                                    </TableCell>
                                    <TableCell className={`text-right font-bold ${item.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(item.totalProfit)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                        {stats.length > 0 && (
                            <TableRow className="bg-muted font-bold">
                                <TableCell>{t('total')}</TableCell>
                                <TableCell className="text-right">{totals.totalQty}</TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(totals.totalRevenue)}
                                </TableCell>
                                <TableCell className="text-right">
                                    {formatCurrency(totals.totalCost)}
                                </TableCell>
                                <TableCell className={`text-right ${totals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(totals.totalProfit)}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default ProfitPage;
