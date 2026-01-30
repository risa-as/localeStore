import React from 'react';
import { buttonVariants, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AccessibleButtonProps extends ButtonProps {
    icon?: React.ReactNode;
    label: string; // The required accessible label
    showText?: boolean; // Whether to visually show the label
}

export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
    icon,
    label,
    showText = false,
    children,
    className,
    variant = "default",
    size = "default",
    ...props
}) => {
    return (
        <button
            className={cn(buttonVariants({ variant, size, className }))}
            aria-label={label}
            title={label}
            {...props}
        >
            {icon}
            {showText && <span>{label}</span>}
            {!showText && <span className="sr-only">{label}</span>}
            {children}
        </button>
    );
};
