"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Product } from "@/types";
import Autoplay from "embla-carousel-autoplay";
import { AccessibleImage } from "@/components/ui/accessible-image";
import Link from "next/link";

const ProductCarousel = ({ data }: { data: Product[] }) => {
  return (
    <Carousel
      className="w-full mb-8 sm:mb-12 rounded-3xl overflow-hidden border-2 shadow-xl shadow-primary/5"
      opts={{ loop: true }}
      plugins={[
        Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true }),
      ]}
    >
      <CarouselContent>
        {data.map((product: Product, index: number) => (
          <CarouselItem key={product.id}>
            <Link href={`/product/${product.slug}`} className="block">
              <div className="relative">
                <AccessibleImage
                  src={product.banner!}
                  alt={product.name}
                  height="0"
                  width="0"
                  sizes="100vw"
                  priority={index === 0}
                  className="w-full h-auto max-h-[220px] sm:max-h-[400px] md:max-h-[500px] object-cover"
                />
                {/* Gradient + name */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end p-4 sm:p-8">
                  <div>
                    <p className="text-white/70 text-xs sm:text-sm font-semibold uppercase tracking-widest mb-1">
                      عرض مميز
                    </p>
                    <h2 className="text-base sm:text-2xl md:text-3xl font-extrabold text-white drop-shadow-lg line-clamp-2">
                      {product.name}
                    </h2>
                  </div>
                </div>
              </div>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="start-3 sm:start-5 h-9 w-9 sm:h-11 sm:w-11 bg-white/90 hover:bg-white border-0 shadow-lg" />
      <CarouselNext className="end-3 sm:end-5 h-9 w-9 sm:h-11 sm:w-11 bg-white/90 hover:bg-white border-0 shadow-lg" />
    </Carousel>
  );
};

export default ProductCarousel;
