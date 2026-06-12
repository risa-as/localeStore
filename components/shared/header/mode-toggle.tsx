"use client";

import { AccessibleButton } from "@/components/ui/accessible-button";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu";
import { SunIcon, MoonIcon, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";


const ModeToggle = () => {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();
    const t = useTranslations("Theme");

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, [])
    if (!mounted) {
        return null;
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <AccessibleButton
                    variant="ghost"
                    className="focus-visible:ring-0 focus-visible:ring-offset-0"
                    label="Toggle theme"
                    icon={theme === "system" ? (
                        <SunMoon className="w-5 h-5" />
                    ) : theme === "light" ? (
                        <SunIcon className="w-5 h-5" />
                    ) : (
                        <MoonIcon className="w-5 h-5" />
                    )}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("appearance")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                    checked={theme === "system"}
                    onCheckedChange={() => setTheme("system")}
                >
                    {t("system")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    checked={theme === "dark"}
                    onCheckedChange={() => setTheme("dark")}
                >
                    {t("dark")}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    checked={theme === "light"}
                    onCheckedChange={() => setTheme("light")}
                >
                    {t("light")}
                </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default ModeToggle;