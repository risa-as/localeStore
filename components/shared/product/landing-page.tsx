"use client";

import { formatCurrency } from "@/lib/utils";
import { Product } from "@/types";
import { Star, ShieldCheck, Truck, RotateCcw, ChevronLeft, ChevronRight, Tag } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { QuickOrderForm } from "./quick-order-form";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
// Start Pixel Code
import { v4 as uuidv4 } from 'uuid';
import { sendCAPIEvent } from "@/lib/actions/facebook.actions";
import FbPixel from "../facebook-pixel";
// End Pixel Code
export default function LandingPage({ product }: { product: Product }) {
    const t = useTranslations('LandingPage');
    const locale = useLocale();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const images = product.images && product.images.length > 0 ? product.images : ['/images/placeholder.jpg'];

    const nextImage = () => {
        setCurrentImageIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = () => {
        setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    };


    //Start API Code
    const [eventId] = useState(() => uuidv4());

    useEffect(() => {
        sendCAPIEvent("PageView", eventId, {
            eventSourceUrl: window.location.href,
        }).catch(console.error);
    }, [eventId]);
    //End API Code

    return (
        <div className="min-h-screen relative overflow-x-hidden bg-[#F8F9FA] text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
            {/* Start Pixel Code */}
            <FbPixel eventName="PageView" eventId={eventId} data={{ url: "/" }} />
            {/* End Pixel Code */}
            {/* Background Elements */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-100/50 rounded-full blur-[120px] mix-blend-multiply opacity-70 animate-blob"></div>
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-100/50 rounded-full blur-[120px] mix-blend-multiply opacity-70 animate-blob animation-delay-2000"></div>
                <div className="absolute bottom-[-20%] left-[20%] w-[50%] h-[50%] bg-indigo-100/50 rounded-full blur-[120px] mix-blend-multiply opacity-70 animate-blob animation-delay-4000"></div>
                {/* <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02]"></div> */}
            </div>

            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 lg:pt-16 lg:pb-32">

                <div className="grid lg:grid-cols-12 gap-8 lg:gap-16 items-start">

                    {/* Left Column: Gallery (Sticky on Desktop) */}
                    <div className="lg:col-span-7 lg:sticky lg:top-8 space-y-6">
                        {/* Main Image Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            className="relative aspect-[4/5] md:aspect-square lg:aspect-[4/5] rounded-[2rem] overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] bg-white group"
                        >
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentImageIndex}
                                    initial={{ opacity: 0, scale: 1.1 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.6 }}
                                    className="absolute inset-0"
                                >
                                    <Image
                                        src={images[currentImageIndex]}
                                        alt={product.name}
                                        fill
                                        className="object-contain"
                                        priority
                                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 40vw"
                                        unoptimized
                                    />
                                </motion.div>
                            </AnimatePresence>

                            {/* Navigation Arrows */}
                            {images.length > 1 && (
                                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                    <button
                                        onClick={prevImage}
                                        className="pointer-events-auto w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white hover:text-slate-900 flex items-center justify-center transition-all duration-300 shadow-lg hover:scale-110"
                                    >
                                        <ChevronLeft className="w-6 h-6" />
                                    </button>
                                    <button
                                        onClick={nextImage}
                                        className="pointer-events-auto w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white hover:text-slate-900 flex items-center justify-center transition-all duration-300 shadow-lg hover:scale-110"
                                    >
                                        <ChevronRight className="w-6 h-6" />
                                    </button>
                                </div>
                            )}

                            {/* Floating Badges */}
                            <div className="absolute top-6 left-6 flex flex-col gap-2">
                                {Number(product.stock) > 0 && Number(product.stock) < 10 && (
                                    <span className="px-4 py-2 bg-red-500/90 backdrop-blur-sm text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-lg border border-white/10">
                                        {t('onlyLeft', { count: product.stock })}
                                    </span>
                                )}
                                <span className="px-4 py-2 bg-slate-900/80 backdrop-blur-sm text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-lg border border-white/10">
                                    {t('premiumCollection')}
                                </span>
                            </div>
                        </motion.div>

                        {/* Thumbnails */}
                        {images.length > 1 && (
                            <div className={`flex gap-3 overflow-x-auto pb-2 scrollbar-hide ${locale === 'ar' ? 'pr-1' : 'pl-1'}`}>
                                {images.map((img, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentImageIndex(idx)}
                                        className={cn(
                                            "relative w-20 h-20 rounded-xl overflow-hidden transition-all duration-300 flex-shrink-0 border-2 p-1 mt-2",
                                            currentImageIndex === idx
                                                ? "border-slate-900 shadow-lg scale-105"
                                                : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                                        )}
                                    >
                                        <Image
                                            src={img}
                                            alt={`View ${idx + 1}`}
                                            fill
                                            className="object-cover rounded-lg"
                                            sizes="80px"
                                            unoptimized
                                        />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Features Horizontal Strip */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                            {[
                                { icon: ShieldCheck, title: t('warranty') },
                                {
                                    icon: Truck,
                                    title: Number(product.shippingPrice) === 0
                                        ? t('freeShipping')
                                        : `${t('shipping')}: ${formatCurrency(Number(product.shippingPrice))}`
                                },
                                { icon: RotateCcw, title: t('easyReturns') },
                                { icon: Star, title: t('premiumQuality') }
                            ].map((feature, idx) => (
                                <div key={idx} className="flex flex-col items-center text-center p-3 rounded-2xl bg-white/60 border border-white/60 shadow-sm backdrop-blur-sm">
                                    <feature.icon className="w-5 h-5 text-slate-700 mb-2" />
                                    <span className="text-xs font-semibold text-slate-700">{feature.title}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Column: Product Details & Form */}
                    <div className="lg:col-span-5 space-y-8 relative">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                        >
                            {/* Header */}
                            <div className="space-y-4 mb-8">
                                <h1 className="text-4xl lg:text-5xl font-serif font-medium text-slate-900 leading-[1.1]">
                                    {product.name}
                                </h1>
                                <div className="flex items-baseline gap-4">
                                    <span className="text-3xl font-light text-slate-900">
                                        {formatCurrency(Number(product.price))}
                                    </span>
                                    {Number(product.stock) > 0 && (
                                        <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            Inside Stock
                                        </span>
                                    )}
                                </div>

                                {/* Shipping Cost Display */}
                                {/* Shipping Cost Display */}
                                <div className="flex items-center gap-2 text-sm">
                                    {Number(product.shippingPrice) === 0 ? (
                                        <span className="font-semibold text-green-600 flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md border border-green-100">
                                            <Truck className="w-4 h-4" />
                                            {t('freeShipping')}
                                        </span>
                                    ) : (
                                        <span className="font-medium text-slate-600 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                            <Truck className="w-4 h-4 text-slate-500" />
                                            {t('shipping')}: <span className="text-slate-900 font-semibold">{formatCurrency(Number(product.shippingPrice))}</span>
                                        </span>
                                    )}
                                </div>

                                {/* Offers */}
                                {product.offers && (
                                    <div className="flex flex-wrap items-center gap-3 text-sm">
                                        {product.offers.split(',').map((offer, index) => (
                                            <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg font-medium border border-red-100">
                                                <Tag className="w-4 h-4" />
                                                {offer.trim()}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <p className="text-slate-600 text-lg leading-relaxed font-light">
                                    {product.description}
                                </p>
                            </div>

                            {/* Order Form Card */}
                            <div className="relative rounded-[2.5rem] p-1 bg-gradient-to-br from-white/80 to-white/40 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] backdrop-blur-xl border border-white/50">
                                <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-blue-50/50 to-purple-50/50 opacity-50" />
                                <div className="relative rounded-[2.3rem] bg-white/40 p-6 md:p-8 backdrop-blur-sm">
                                    <QuickOrderForm product={product} />

                                    <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-widest">
                                        <ShieldCheck className="w-3 h-3" />
                                        {t('securePayment')}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 py-8 text-center text-slate-400 text-sm font-light">
                <p>&copy; {new Date().getFullYear()} AURUM Luxury Store. Excellence in every detail.</p>
            </footer>
        </div>
    );
}
