
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Home, Package } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function OrderCompletedPage(props: {
    params: Promise<{
        id: string;
    }>;
}) {
    const { id } = await props.params;
    const t = await getTranslations('ThankYou'); // Reuse ThankYou strings or default

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-4">
            <Card className="w-full max-w-md text-center border-2 border-green-500/20 shadow-xl">
                <CardHeader className="flex flex-col items-center gap-4 pb-2">
                    <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="h-10 w-10 text-green-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-green-700">
                        {t('title')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground">
                        {t('message')}
                    </p>
                    <div className="bg-muted/50 p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground uppercase">{t('orderReference')}</p>
                        <p className="text-lg font-mono font-bold">{id}</p>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3 pt-6">
                    <Button asChild className="w-full" size="lg">
                        <Link href="/">
                            <Home className="mr-2 h-4 w-4" />
                            {t('continueShopping')}
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                        <Link href={`/order/${id}`}>
                            <Package className="mr-2 h-4 w-4" />
                            View Order Details
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
