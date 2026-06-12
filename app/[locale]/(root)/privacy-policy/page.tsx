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
    badge: "Privacy & Data Protection",
    title: "Privacy Policy",
    intro:
      "We respect your privacy and handle personal information only to process orders, deliver products, and provide customer support. We do not sell or misuse your data.",
    lastUpdated: "Last updated: May 6, 2026",
    highlightsTitle: "Key Points",
    highlights: [
      "We collect only the information needed to process and deliver orders.",
      "We do not sell, rent, or trade personal data with third parties.",
      "Information is stored securely and used for customer support and order fulfillment only.",
    ],
    contactTitle: "Need help?",
    contactText:
      "If you have questions about how your information is used, you can contact us through the store support channels listed on the website.",
    contactCta: "Review our terms",
    sections: [
      {
        title: "1. Information We Collect",
        body: [
          "When you place an order or contact us, we may collect personal information such as your name, phone number, shipping address, and any order-related details you choose to provide.",
          "We collect this information directly from you so we can confirm purchases, arrange delivery, and respond to support requests.",
        ],
      },
      {
        title: "2. How We Use Your Information",
        body: [
          "Your information is used only for legitimate business purposes related to our store, including order processing, delivery coordination, payment follow-up when needed, and customer support.",
          "We do not use your data for unrelated purposes, and we do not sell or exploit personal information for advertising resale or unauthorized marketing.",
        ],
      },
      {
        title: "3. Data Sharing",
        body: [
          "We do not sell, rent, or intentionally disclose your personal data to third parties except when necessary to complete your order, such as working with delivery providers or service partners involved in order fulfillment.",
          "Any required sharing is limited to the minimum information necessary to complete the requested service.",
        ],
      },
      {
        title: "4. Data Security",
        body: [
          "We take reasonable technical and organizational measures to protect personal information from unauthorized access, misuse, loss, or alteration.",
          "Although no storage system can be guaranteed to be completely secure, we limit access to relevant personnel and use the information only within the scope of store operations.",
        ],
      },
      {
        title: "5. Your Consent",
        body: [
          "By using our website, placing an order, or communicating with our store, you consent to the collection and use of your information as described in this Privacy Policy.",
          "If our privacy practices change materially, the updated policy published on this page will govern future use of the service.",
        ],
      },
    ],
  },
  ar: {
    badge: "الخصوصية وحماية البيانات",
    title: "سياسة الخصوصية",
    intro:
      "نحن نحترم خصوصيتك ونتعامل مع بياناتك الشخصية فقط بالقدر اللازم لمعالجة الطلبات وتسليم المنتجات وتقديم الدعم للعملاء. نحن لا نبيع بياناتك ولا نسيء استخدامها.",
    lastUpdated: "آخر تحديث: 6 مايو 2026",
    highlightsTitle: "نقاط أساسية",
    highlights: [
      "نجمع فقط المعلومات الضرورية لمعالجة الطلبات وتسليمها.",
      "لا نقوم ببيع أو تأجير أو المتاجرة بالبيانات الشخصية مع أي طرف ثالث.",
      "يتم حفظ المعلومات بشكل آمن وتستخدم فقط لتنفيذ الطلبات وخدمة العملاء.",
    ],
    contactTitle: "هل تحتاج إلى مساعدة؟",
    contactText:
      "إذا كان لديك أي استفسار حول طريقة استخدام معلوماتك، يمكنك التواصل معنا عبر قنوات الدعم المتاحة داخل الموقع.",
    contactCta: "الاطلاع على الشروط والأحكام",
    sections: [
      {
        title: "1. المعلومات التي نجمعها",
        body: [
          "عند تقديم طلب أو التواصل معنا، قد نقوم بجمع معلومات شخصية مثل الاسم ورقم الهاتف وعنوان الشحن وأي تفاصيل مرتبطة بالطلب تقوم بتزويدنا بها.",
          "يتم جمع هذه المعلومات منك مباشرة حتى نتمكن من تأكيد الطلبات وترتيب التوصيل والرد على طلبات الدعم.",
        ],
      },
      {
        title: "2. كيفية استخدام المعلومات",
        body: [
          "تستخدم معلوماتك فقط للأغراض المشروعة المرتبطة بعمل المتجر، بما في ذلك معالجة الطلبات، تنسيق التوصيل، متابعة الدفع عند الحاجة، وتقديم خدمة العملاء.",
          "ولا يتم استخدام بياناتك لأي أغراض غير مرتبطة بالخدمة، كما أننا لا نبيعها أو نستغلها لأغراض دعائية غير مصرح بها.",
        ],
      },
      {
        title: "3. مشاركة البيانات",
        body: [
          "نحن لا نبيع ولا نؤجر ولا نفصح عمداً عن بياناتك الشخصية لأي طرف ثالث إلا عند الحاجة لتنفيذ الطلب، مثل شركات التوصيل أو الجهات الخدمية المشاركة في إتمام الطلب.",
          "وأي مشاركة مطلوبة تكون في حدود الحد الأدنى من المعلومات اللازمة لتقديم الخدمة المطلوبة فقط.",
        ],
      },
      {
        title: "4. حماية البيانات",
        body: [
          "نتخذ إجراءات تقنية وتنظيمية معقولة لحماية المعلومات الشخصية من الوصول غير المصرح به أو سوء الاستخدام أو الفقدان أو التعديل.",
          "ورغم أنه لا توجد وسيلة تخزين مضمونة بالكامل، فإننا نقصر الوصول إلى البيانات على الجهات المعنية فقط ونستخدمها ضمن نطاق تشغيل المتجر حصراً.",
        ],
      },
      {
        title: "5. الموافقة على السياسة",
        body: [
          "باستخدامك لهذا الموقع أو بإتمام طلب شراء أو بالتواصل معنا، فإنك توافق على جمع معلوماتك واستخدامها وفقاً لما هو موضح في سياسة الخصوصية هذه.",
          "وفي حال تم إجراء أي تحديث جوهري على هذه السياسة، فإن النسخة المنشورة في هذه الصفحة هي المعتمدة للاستخدام المستقبلي للخدمة.",
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
    currentLocale === "en" ? "Privacy Policy" : "سياسة الخصوصية";

  return {
    title,
    description: `${title} for ${APP_NAME}`,
  };
}

export default async function PrivacyPolicyPage({
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
      contactHref="/terms-of-service"
      variant="privacy"
    />
  );
}
