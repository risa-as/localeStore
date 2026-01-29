"use client";

import { useEffect, useRef } from "react";

type PixelProps = {
    eventName: "PageView" | "ViewContent" | "Purchase";
    eventId: string;
    data?: any;
};

export default function FbPixel({ eventName, eventId, data = {} }: PixelProps) {
    const hasSentRef = useRef(false); // الحارس لمنع التكرار

    useEffect(() => {
        // إذا تم الإرسال سابقاً، توقف فوراً
        if (hasSentRef.current) {
            console.log(`⚠️ FbPixel already sent: ${eventName}, skipping.`);
            return;
        }

        console.log(`ℹ️ FbPixel Mounted: ${eventName}. Checking fbq...`);

        const sendEvent = () => {
            if (typeof window !== 'undefined' && (window as any).fbq) {
                // إرسال الحدث
                console.log(`✅ fbq found. Firing: ${eventName}`);
                (window as any).fbq("track", eventName, data, { eventID: eventId });

                // وضع علامة بأنه تم الإرسال
                hasSentRef.current = true;
                console.log(`🎯 Browser Pixel Fired: ${eventName}`);
                return true;
            }
            console.warn(`❌ fbq not found yet for: ${eventName}`);
            return false;
        };

        // محاولة الإرسال (مع إعادة المحاولة في حال تأخر تحميل السكربت)
        // دالة المحاولة
        const trySend = () => {
            if (sendEvent()) return;

            console.log(`⏳ Starting retries for: ${eventName}`);
            let attempts = 0;
            // إذا لم ينجح، نحاول كل 500 مللي ثانية لمدة 5 ثواني
            const interval = setInterval(() => {
                attempts++;
                console.log(`🔄 Retry #${attempts} for: ${eventName}`);
                if (sendEvent()) {
                    clearInterval(interval);
                }
            }, 500);

            // إيقاف المحاولة بعد 10 ثواني لتجنب الذاكرة
            setTimeout(() => {
                if (!hasSentRef.current) console.error(`🚨 Failed to fire ${eventName} after 10s timeout.`);
                clearInterval(interval);
            }, 10000);

            return () => clearInterval(interval);
        };

        trySend();
    }, [eventName, eventId, data]);

    return null; // لا يُرجع أي واجهة
}