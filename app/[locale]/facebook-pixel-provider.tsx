"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

export function FacebookPixelProvider() {
    const pathname = usePathname();

    // تتبع التنقل بين الصفحات (PageView)
    useEffect(() => {
        // لا تقم بإرسال PageView في صفحة شكرا (لأننا نرسل Purchase فقط حسب الطلب)
        if (pathname?.includes('/thank-you')) {
            return;
        }

        // صفحات الهبوط ترسل PageView بنفسها مقترناً بحدث Conversions API بنفس
        // eventID (فيُدمجان عند ميتا). إرسال PageView إضافي من هنا يُنتج حدثاً
        // ثانياً بلا معرّف فتُحتسب زيارة واحدة زيارتين.
        if (pathname?.includes('/landing')) {
            return;
        }

        // ننتظر جاهزية fbq بالفحص لا بـ onLoad: الأخير لا يُطلَق أبداً مع سكربت
        // سطري — Next يستمع لحدث load، وعنصر <script> بلا src لا يُطلقه إطلاقاً
        // (راجع next/dist/client/script.js). كان ذلك يُعطّل PageView في كل
        // صفحات الموقع. الفحص يعمل كذلك عند العودة لصفحة سبق تحميل السكربت فيها.
        const fire = () => {
            const fbq = window.fbq;
            if (!fbq) return false;
            fbq('track', 'PageView');
            return true;
        };
        if (fire()) return;

        let attempts = 0;
        const interval = setInterval(() => {
            attempts += 1;
            if (fire() || attempts >= 10) clearInterval(interval);
        }, 300);

        return () => clearInterval(interval);
    }, [pathname]);

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