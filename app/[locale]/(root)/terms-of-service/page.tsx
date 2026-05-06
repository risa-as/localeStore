import type { Metadata } from "next";

import LegalPage from "@/components/legal-page";
import { APP_NAME } from "@/lib/constants";

type Locale = "ar" | "en";

const content: Record<
  Locale,
  {
    badge: string;
    title: string;
    intro: string;
    lastUpdated: string;
    highlightsTitle: string;
    highlights: string[];
    contactTitle: string;
    contactText: string;
    contactCta: string;
    sections: { title: string; body: string[] }[];
  }
> = {
  en: {
    badge: "Store Terms",
    title: "Terms of Service",
    intro:
      "These Terms of Service explain the basic rules that apply when you place an order through our store. By using the service, you agree to these terms.",
    lastUpdated: "Last updated: May 6, 2026",
    highlightsTitle: "Key Points",
    highlights: [
      "Orders are subject to product availability and confirmation.",
      "Delivery times may vary depending on destination and logistics conditions.",
      "We are not responsible for delays caused by factors outside our control.",
    ],
    contactTitle: "Questions about these terms?",
    contactText:
      "If you need clarification about ordering, shipping, or support obligations, please contact the store through the published support channels.",
    contactCta: "View privacy policy",
    sections: [
      {
        title: "1. Order Acceptance",
        body: [
          "All orders placed through the website are subject to product availability and acceptance by the store. Submitting an order does not guarantee final acceptance until the order is reviewed and confirmed.",
          "We reserve the right to decline or cancel an order if a product becomes unavailable, if order details are incomplete, or if we reasonably suspect misuse of the service.",
        ],
      },
      {
        title: "2. Delivery and Fulfillment",
        body: [
          "Delivery times may vary depending on the customer location, shipping capacity, public conditions, and other operational factors related to fulfillment.",
          "We make reasonable efforts to process and deliver orders as promptly as possible, but exact delivery timelines are not guaranteed unless explicitly stated.",
        ],
      },
      {
        title: "3. External Delays",
        body: [
          "We are not responsible for delays or disruptions caused by circumstances outside our reasonable control, including courier issues, weather conditions, traffic restrictions, technical outages, or other force majeure events.",
          "When such issues occur, we will make reasonable efforts to keep the customer informed and continue processing the order when possible.",
        ],
      },
      {
        title: "4. Customer Responsibilities",
        body: [
          "Customers are responsible for providing accurate order details, including name, phone number, and delivery address. Incorrect or incomplete information may affect successful delivery.",
          "By placing an order, you confirm that the information you provide is accurate and that you are authorized to use the service.",
        ],
      },
      {
        title: "5. Agreement to Terms",
        body: [
          "By placing an order through our store, you acknowledge that you have read and agreed to these Terms of Service.",
          "We may update these terms from time to time, and the version published on this page will apply to future use of the website and its services.",
        ],
      },
    ],
  },
  ar: {
    badge: "شروط المتجر",
    title: "الشروط والأحكام",
    intro:
      "توضح هذه الشروط والأحكام القواعد الأساسية التي تنطبق عند تقديم طلب من خلال متجرنا. باستخدامك للخدمة أو بإتمام الطلب فإنك توافق على هذه الشروط.",
    lastUpdated: "آخر تحديث: 6 مايو 2026",
    highlightsTitle: "نقاط أساسية",
    highlights: [
      "جميع الطلبات تخضع لتوفر المنتجات وتأكيد الطلب.",
      "قد تختلف مدة التوصيل بحسب الوجهة والظروف التشغيلية.",
      "لا نتحمل مسؤولية التأخير الناتج عن عوامل خارجة عن إرادتنا.",
    ],
    contactTitle: "هل لديك استفسار حول الشروط؟",
    contactText:
      "إذا كنت بحاجة إلى توضيح بخصوص الطلبات أو الشحن أو التزامات الدعم، فيمكنك التواصل مع المتجر عبر قنوات الدعم المنشورة.",
    contactCta: "عرض سياسة الخصوصية",
    sections: [
      {
        title: "1. قبول الطلبات",
        body: [
          "جميع الطلبات المقدمة عبر الموقع تخضع لتوفر المنتجات ولمراجعة المتجر واعتماد الطلب. إرسال الطلب لا يعني قبوله بشكل نهائي إلا بعد مراجعته وتأكيده.",
          "ويحق لنا رفض أو إلغاء أي طلب إذا أصبح المنتج غير متوفر أو كانت بيانات الطلب غير مكتملة أو وُجد سبب منطقي للاشتباه في إساءة استخدام الخدمة.",
        ],
      },
      {
        title: "2. التوصيل وتنفيذ الطلب",
        body: [
          "قد تختلف مدة التوصيل بحسب موقع العميل وقدرة الشحن والظروف العامة وأي عوامل تشغيلية أخرى مرتبطة بتنفيذ الطلب.",
          "نحن نبذل جهداً معقولاً لمعالجة الطلبات وتسليمها بأسرع وقت ممكن، لكن لا نضمن مدة زمنية دقيقة للتسليم إلا إذا تم النص عليها صراحة.",
        ],
      },
      {
        title: "3. حالات التأخير الخارجي",
        body: [
          "لا نتحمل المسؤولية عن أي تأخير أو تعطل ناتج عن ظروف خارجة عن نطاق سيطرتنا المعقولة، بما في ذلك مشكلات شركات التوصيل أو الأحوال الجوية أو قيود المرور أو الأعطال التقنية أو الظروف القاهرة.",
          "وعند حدوث مثل هذه الحالات، سنبذل جهداً معقولاً لإبقاء العميل على اطلاع ومتابعة تنفيذ الطلب متى ما كان ذلك ممكناً.",
        ],
      },
      {
        title: "4. مسؤولية العميل",
        body: [
          "يتحمل العميل مسؤولية تزويدنا ببيانات صحيحة وكاملة، بما في ذلك الاسم ورقم الهاتف وعنوان التوصيل. وقد يؤدي إدخال بيانات غير دقيقة أو ناقصة إلى تعذر التسليم أو تأخره.",
          "وبتقديم الطلب فإنك تؤكد صحة المعلومات التي زودتنا بها وأنك مخول باستخدام هذه الخدمة.",
        ],
      },
      {
        title: "5. الموافقة على الشروط",
        body: [
          "عند تقديم طلب عبر متجرنا فإنك تقر بأنك قرأت هذه الشروط والأحكام ووافقت عليها.",
          "وقد نقوم بتحديث هذه الشروط من وقت لآخر، وتعد النسخة المنشورة في هذه الصفحة هي المرجع المعتمد للاستخدام المستقبلي للموقع وخدماته.",
        ],
      },
    ],
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const currentLocale = locale === "en" ? "en" : "ar";
  const title =
    currentLocale === "en" ? "Terms of Service" : "الشروط والأحكام";

  return {
    title,
    description: `${title} for ${APP_NAME}`,
  };
}

export default async function TermsOfServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const currentLocale = locale === "en" ? "en" : "ar";
  const page = content[currentLocale];

  return (
    <LegalPage
      badge={page.badge}
      title={page.title}
      intro={page.intro}
      lastUpdated={page.lastUpdated}
      highlightsTitle={page.highlightsTitle}
      highlights={page.highlights}
      sections={page.sections}
      contactTitle={page.contactTitle}
      contactText={page.contactText}
      contactCta={page.contactCta}
      contactHref="/privacy-policy"
      variant="terms"
    />
  );
}
