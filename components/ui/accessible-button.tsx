import React from 'react';

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon?: React.ReactNode;
    label: string; // The required accessible label
    showText?: boolean; // Whether to visually show the label
    variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
}

export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
    icon,
    label,
    showText = false,
    children,
    className = '',
    variant = 'primary',
    ...props
}) => {
    const baseClasses = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

    const variantClasses = {
        primary: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground" // Added outline mapping to ghost-like or outline style
    };

    return (
        <button
            className={`${baseClasses} ${variantClasses[variant] || variantClasses.primary} ${className}`}
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
