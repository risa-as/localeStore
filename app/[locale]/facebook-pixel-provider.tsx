"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";

export function FacebookPixelProvider() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [loaded, setLoaded] = useState(false);
    // تتبع التنقل بين الصفحات (PageView)
    useEffect(() => {
        if (!loaded) return;

        // لا تقم بإرسال PageView في صفحة شكرا (لأننا نرسل Purchase فقط حسب الطلب)
        if (pathname?.includes('/thank-you')) {
            console.log("🚫 Skipping Global PageView on Thank You page.");
            return;
        }

        if ((window as any).fbq) {
            console.log("📍 Global PageView Triggered");
            (window as any).fbq('track', 'PageView');
        } else {
            console.warn("❌ fbq not found during global PageView trigger");
        }
    }, [pathname, searchParams, loaded]);

    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;

    // حماية: إذا لم يوجد ID لا تقم بتحميل السكربت
    if (!pixelId) {
        console.error("⚠️ Facebook Pixel ID is missing or invalid in Provider.");
        return null;
    }



    return (
        <>
            {/* استخدام مكون Script الرسمي من Next.js */}
            <Script
                id="fb-pixel"
                strategy="afterInteractive" // الخيار الأفضل للبكسل
                onLoad={() => {
                    setLoaded(true);
                    console.log('✅ Facebook Pixel Loaded & Initialized');
                }}
                dangerouslySetInnerHTML={{
                    __html: `
                    !function(f,b,e,v,n,t,s)
                    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                    n.queue=[];t=b.createElement(e);t.async=!0;
                    t.src=v;s=b.getElementsByTagName(e)[0];
                    s.parentNode.insertBefore(t,s)}(window, document,'script',
                    'https://connect.facebook.net/en_US/fbevents.js');
                    
                    fbq('init', '${pixelId}');
                    `,
                }}
            />
        </>
    );
}