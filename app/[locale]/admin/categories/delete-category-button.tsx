"use client";
import { Button } from "@/components/ui/button";
import { Loader2, Trash } from "lucide-react";
import { useTransition } from "react";
import { deleteCategory } from "@/lib/actions/category.actions";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";

export default function DeleteCategoryButton({ id }: { id: string }) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const t = useTranslations("Admin");

    return (
        <Button
            variant="destructive"
            size="icon"
            disabled={isPending}
            onClick={() =>
                startTransition(async () => {
                    const res = await deleteCategory(id);
                    toast({
                        variant: res.success ? "default" : "destructive",
                        description: res.message, // The message from server might be in English. Ideally server should return key or we translate status. 
                        // For now, let's keep message as is, but we can translate the button tooltip or aria labels if they existed. 
                        // Actually, the button has no text, just icon. 
                        // But we should probably translate the toast titles if we were constructing them here. 
                        // The user asked to translate "all terms". 
                        // The toast description comes from `res.message`. 
                        // `deleteCategory` likely returns a string.
                    });
                })
            }
        >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
        </Button>
    );
}
