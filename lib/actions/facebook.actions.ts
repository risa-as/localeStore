"use server";

import { FacebookAdsApi, EventRequest, UserData, CustomData, ServerEvent } from 'facebook-nodejs-business-sdk';
import { headers, cookies } from 'next/headers'; // <--- 1. استيراد cookies

// إعدادات الاتصال
const ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN || "";
const PIXEL_ID = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID || "";

// تهيئة API مرة واحدة خارج الدالة
const api = FacebookAdsApi.init(ACCESS_TOKEN);

export async function sendCAPIEvent(
    eventName: "PageView" | "ViewContent" | "Purchase",
    eventId: string,
    eventData: any
) {
    // جلب الهيدرز والكوكيز
    const requestHeaders = await headers();
    const cookieStore = await cookies(); // <--- 2. جلب مخزن الكوكيز

    // استخراج fbp و fbc من الكوكيز
    // البكسل يقوم بتخزين هذه القيم تلقائياً في المتصفح باسم _fbp و _fbc
    const fbp = cookieStore.get('_fbp')?.value;
    const fbc = cookieStore.get('_fbc')?.value;

    // 1. تجهيز بيانات المستخدم (UserData)
    const clientIp =
        requestHeaders.get("x-forwarded-for")?.split(',')[0]?.trim() || // الأهم لمنصات Vercel
        requestHeaders.get("x-real-ip") || // احتياطي لبعض السيرفرات
        requestHeaders.get("cf-connecting-ip") || // ممتاز إذا كنت تستخدم Cloudflare
        requestHeaders.get("forwarded") || // المعيار الرسمي لجلب IP
        "0.0.0.0"; // قيمة احتياطية آمنة لمنع توقف الكود

    // نعتمد على الهيدر القادم من الطلب
    const clientUserAgent = requestHeaders.get("user-agent") || "";

    // 🔴 حماية: عدم تتبع البوتات (Crawlers)
    const isBot = /bot|googlebot|crawler|spider|robot|crawling/i.test(clientUserAgent);
    if (isBot) {
        console.log(`🤖 CAPI Skipped: Bot detected (${clientUserAgent})`);
        return { success: false, error: "Bot detected" };
    }

    const userData = (new UserData())
        .setClientIpAddress(clientIp)
        .setClientUserAgent(clientUserAgent);

    // إضافة fbp و fbc (Advanced Matching)
    if (fbp) (userData as any).setFbp(fbp); // <--- 3. تعيين fbp
    if (fbc) (userData as any).setFbc(fbc); // <--- 4. تعيين fbc (يعمل فقط إذا جاء الزائر من إعلان)

    // إضافة باقي البيانات الشخصية إن وجدت
    if (eventData.email) userData.setEmail(eventData.email);
    if (eventData.phone) userData.setPhone(eventData.phone);
    if (eventData.firstName) userData.setFirstName(eventData.firstName);
    if (eventData.lastName) userData.setLastName(eventData.lastName);
    if (eventData.city) userData.setCity(eventData.city);
    if (eventData.country) userData.setCountry(eventData.country);
    if (eventData.externalId) (userData as any).setExternalId(eventData.externalId); // إضافة External ID


    // 2. تجهيز بيانات الحدث
    const eventSourceUrl = eventData.eventSourceUrl || requestHeaders.get('referer');
    const eventTime = Math.floor(Date.now() / 1000);

    // 3. بناء Custom Data (السعر والعملة)
    const customData = new CustomData();
    if (eventData.value) customData.setValue(Number(eventData.value));
    if (eventData.currency) customData.setCurrency(eventData.currency);

    // إضافة محتويات الطلب (مهمة جداً للكتالوج)
    if (eventData.content_ids) customData.setContentIds(eventData.content_ids);
    if (eventData.content_type) customData.setContentType(eventData.content_type);
    if (eventData.content_name) customData.setContentName(eventData.content_name);

    // 4. بناء الحدث النهائي
    const serverEvent = new ServerEvent()
        .setEventName(eventName)
        .setEventId(eventId)
        .setEventTime(eventTime)
        .setUserData(userData)
        .setCustomData(customData)
        .setActionSource("website")
        .setEventSourceUrl(eventSourceUrl);

    // 5. الإرسال
    const eventRequest = new EventRequest(ACCESS_TOKEN, PIXEL_ID)
        .setEvents([serverEvent]);
    try {
        await eventRequest.execute();
        console.log(`🚀 CAPI Sent: ${eventName} | fbp: ${fbp ? '✅' : '❌'} | fbc: ${fbc ? '✅' : '❌'}`);
        return { success: true };
    } catch (error: any) {
        console.error("❌ CAPI Failed:", error);
        return { success: false, error: error.message || "Unknown error" };
    }
}