"use client";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { deleteCategory } from "@/lib/actions/category.actions";
import { useToast } from "@/hooks/use-toast";

export default function DeleteCategoryButton({ id }: { id: string }) {
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    return (
        <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() =>
                startTransition(async () => {
                    const res = await deleteCategory(id);
                    toast({
                        variant: res.success ? "default" : "destructive",
                        description: res.message,
                    });
                })
            }
        >
            {isPending ? "Deleting..." : "Delete"}
        </Button>
    );
}
