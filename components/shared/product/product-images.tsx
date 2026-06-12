"use client";
import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const ProductImages = ({ images }: { images: string[] }) => {
  const [current, setCurrent] = useState(0);

  return (
    <div className="space-y-3 p-3">
      {/* Main image */}
      <div className="rounded-2xl overflow-hidden bg-muted/20 border">
        <Image
          src={images[current]}
          alt="Product Image"
          width={800}
          height={800}
          className="w-full aspect-square object-contain"
          priority
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((image, index) => (
            <button
              key={image}
              onClick={() => setCurrent(index)}
              className={cn(
                "rounded-xl overflow-hidden border-2 shrink-0 transition-all focus:outline-none",
                current === index
                  ? "border-primary scale-105 shadow-lg shadow-primary/20"
                  : "border-border hover:border-primary/50 opacity-70 hover:opacity-100"
              )}
              style={{ width: 68, height: 68 }}
              aria-label={`صورة ${index + 1}`}
            >
              <Image
                src={image}
                alt={`صورة ${index + 1}`}
                width={68}
                height={68}
                className="object-cover w-full h-full"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductImages;
