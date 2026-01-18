import { cn } from "@/lib/utils";

const ProductPrice = ({ value, className }: { value: number; className?: string }) => {
    // Format number to two decimal places
    const stringValue = (value * 1000).toFixed(0);
    // Add commas
    const formattedValue = Number(stringValue).toLocaleString('en-US');

    return (
        <p className={cn("text-2xl", className)}>
            {formattedValue}
            <span className="text-xs align-super"> د.ع</span>
        </p>
    );
}

export default ProductPrice;