import { Link } from "@/i18n/navigation";
import { Button } from "./ui/button";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

const ViewAllProductsButton = () => {
  const t = useTranslations("Home");
  return (
    <div className="flex justify-center my-10">
      <Button
        asChild
        variant="outline"
        size="lg"
        className="gap-2 h-14 px-10 text-base font-bold rounded-2xl border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all"
      >
        <Link href="/search">
          {t("viewAll")}
          <ArrowLeft className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  );
};

export default ViewAllProductsButton;
