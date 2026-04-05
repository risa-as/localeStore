import { ShieldCheck, Truck, RotateCcw, Headset } from "lucide-react";
import { useTranslations } from "next-intl";

const features = [
  {
    icon: Truck,
    key: "freeShipping",
    iconColor: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    icon: RotateCcw,
    key: "moneyBack",
    iconColor: "text-green-500",
    bg: "bg-green-50 dark:bg-green-900/20",
  },
  {
    icon: ShieldCheck,
    key: "payment",
    iconColor: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-900/20",
  },
  {
    icon: Headset,
    key: "support",
    iconColor: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-900/20",
  },
];

const IconBoxes = () => {
  const t = useTranslations("IconBoxes");

  return (
    <section className="my-8 sm:my-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {features.map(({ icon: Icon, key, iconColor, bg }) => (
          <div
            key={key}
            className="flex flex-col items-center text-center p-4 sm:p-6 rounded-2xl border bg-card gap-3 sm:gap-4 hover:border-primary/30 hover:shadow-md transition-all"
          >
            <div className={`p-3 sm:p-4 rounded-2xl ${bg}`}>
              <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${iconColor}`} />
            </div>
            <div>
              <p className="text-sm sm:text-base font-bold leading-tight">{t(`${key}` as any)}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                {t(`${key}Desc` as any)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default IconBoxes;
