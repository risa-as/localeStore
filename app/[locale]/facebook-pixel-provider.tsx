"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

export function FacebookPixelProvider() {
    const pathname = usePathname();
    const [loaded, setLoaded] = useState(false);
    // تتبع التنقل بين الصفحات (PageView)
    useEffect(() => {
        if (!loaded) return;

        // لا تقم بإرسال PageView في صفحة شكرا (لأننا نرسل Purchase فقط حسب الطلب)
        if (pathname?.includes('/thank-you')) {
            return;
        }

        if ((window as any).fbq) {
            (window as any).fbq('track', 'PageView');
        }
    }, [pathname, loaded]);

    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;

    // حماية: إذا لم يوجد ID لا تقم بتحميل السكربت
    if (!pixelId) {
        return null;
    }

    return (
        <>
            {/* استخدام مكون Script الرسمي من Next.js */}
            <Script
                id="fb-pixel"
                strategy="afterInteractive"
                onLoad={() => {
                    setLoaded(true);
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