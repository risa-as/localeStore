"use client";

import { useEffect, useRef } from "react";

type PixelProps = {
    eventName: "PageView" | "ViewContent" | "Purchase";
    eventId: string;
    data?: any;
};

export default function FbPixel({ eventName, eventId, data = {} }: PixelProps) {
    const hasSentRef = useRef(false);

    useEffect(() => {
        if (hasSentRef.current) {
            return;
        }

        const sendEvent = () => {
            if (typeof window !== 'undefined' && (window as any).fbq) {
                (window as any).fbq("track", eventName, data, { eventID: eventId });
                hasSentRef.current = true;
                return true;
            }
            return false;
        };

        // محاولة الإرسال فوراً
        if (sendEvent()) return;

        // إعادة المحاولة كل 1 ثانية لمدة 5 ثوانٍ
        let attempts = 0;
        const maxAttempts = 5;
        const interval = setInterval(() => {
            attempts++;
            if (sendEvent() || attempts >= maxAttempts) {
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [eventName, eventId, data]);

    return null;
}