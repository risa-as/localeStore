"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Flame, ArrowLeft } from "lucide-react";

const calculateTimeRemaining = (targetDate: Date) => {
  const diff = Math.max(Number(targetDate) - Date.now(), 0);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
};

const DealCountdownClient = ({
  endDate,
  title,
  productImage,
  productSlug,
}: {
  endDate: string;
  title: string;
  productImage: string | null;
  productSlug: string | null;
}) => {
  const t = useTranslations("Deal");
  const tHome = useTranslations("Home");
  const targetDate = new Date(endDate);

  const [time, setTime] = useState(() => calculateTimeRemaining(targetDate));

  useEffect(() => {
    const id = setInterval(() => setTime(calculateTimeRemaining(targetDate)), 1000);
    return () => clearInterval(id);
  }, [endDate]);

  const isDone =
    time.days === 0 && time.hours === 0 && time.minutes === 0 && time.seconds === 0;

  if (isDone) return null;

  return (
    <section className="my-8 sm:my-12 overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-700 text-white shadow-xl shadow-black/30">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* Left — info */}
        <div className="flex flex-col justify-center gap-5 p-6 sm:p-10">
          <div className="flex items-center gap-2 w-fit bg-white/15 backdrop-blur px-4 py-2 rounded-full">
            <Flame className="w-5 h-5 text-orange-400 fill-orange-400" />
            <span className="text-sm font-bold uppercase tracking-widest">{title}</span>
          </div>

          <p className="text-white/75 text-base">{t("description")}</p>

          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: t("days"),    val: time.days },
              { label: t("hours"),   val: time.hours },
              { label: t("minutes"), val: time.minutes },
              { label: t("seconds"), val: time.seconds },
            ].map(({ label, val }) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center bg-white/10 backdrop-blur rounded-2xl p-2 sm:p-3"
              >
                <span className="text-2xl sm:text-3xl font-extrabold tabular-nums leading-none">
                  {String(val).padStart(2, "0")}
                </span>
                <span className="text-[10px] sm:text-xs text-white/60 mt-1 font-medium">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <Button
            asChild
            className="w-fit bg-white text-zinc-900 hover:bg-white/90 font-bold rounded-2xl h-12 px-6 text-base gap-2 shadow-lg"
          >
            <Link href={productSlug ? `/product/${productSlug}` : "/search"}>
              {productSlug ? "اعرف أكثر" : tHome("viewAll")}
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        {/* Right — product image */}
        <div className="hidden sm:flex items-center justify-center p-6 sm:p-10">
          {productImage ? (
            <Image
              src={productImage}
              alt={title}
              width={280}
              height={280}
              className="rounded-2xl object-contain drop-shadow-2xl max-h-64 w-auto"
            />
          ) : (
            <div className="flex items-center justify-center w-48 h-48 rounded-2xl bg-white/10">
              <Flame className="w-20 h-20 text-orange-400/60 fill-orange-400/40" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default DealCountdownClient;
