"use client";
import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const ProductImages = ({ images }: { images: string[] }) => {
    const [current, setCurrent] = useState(0);

    return (
        <div className="space-y-4">
            <Image
                src={images[current]}
                alt="Product Image"
                width={1000}
                height={1000}
                className="min-h-[300px] object-contain object-center rounded-lg border aspect-square"
            />
            <div className="flex gap-2">
                {images.map((image, index) => (
                    <div
                        key={image}
                        onClick={() => setCurrent(index)}
                        className={cn("border cursor-pointer hover:border-orange-600 rounded-md overflow-hidden p-1",
                            current === index && "border-orange-500 border-2"
                        )}
                        style={{ height: '100px', width: '100px' }} // Optional: Enforce thumbnail size
                    >
                        <Image src={image} alt="image" width={100} height={100} className="object-cover object-center w-full h-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default ProductImages;