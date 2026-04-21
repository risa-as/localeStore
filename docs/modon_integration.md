# دليل الربط البرمجي مع شركة مدن للتوصيل (Modon Express)

هذا المستند يعتبر مرجعاً تفصيلياً يشرح تركيبة الأكواد الخاصة بربط متجرك المبني بـ **Next.js** مع واجهة برمجة التطبيقات (API) الخاصة بشركة "مدن".

يتم الربط في النظام باتجاهين:
1. **من النظام إلى مدن:** إرسال بيانات الطلب ليتم إنشاء بوليصة (QR).
2. **من مدن إلى النظام:** التحقق الدوري من حالة الطلب لتحديث النظام (قيد التوصيل، مكتمل، راجع.. الخ).

---

## الاتجاه الأول: إرسال الطلب إلى شركة مدن
تتم عملية الإرسال بمجرد تغيير حالة الطلب (Status) في النظام إلى **"قيد الانتظار" (pending)**. هناك دالة رئيسية تعتني بإنشاء الطلب في مدن تسمى `sendOrderToModon`. 

### 1. تجهيز الطلب في (updateOrder)
عندما يقوم مدير النظام بتغيير الحالة إلى `pending`، يعمل هذا الجزء من كود `updateOrder` في ملف `lib/actions/order.actions.ts`:

```typescript
// ── إرسال تلقائي لمدن عند الانتقال إلى "pending" ──
if (
  order.status === "pending" &&
  existingOrder?.status !== "pending" &&
  !existingOrder?.modonQrId
) {
  // 1. ترجمة المحافظة إلى رقم تعريفي خاص بمدن
  const cityId = MODON_CITY_MAP[order.governorate ?? existingOrder?.governorate ?? ""] ?? "1";

  // 2. معالجة رقم الهاتف (تحويل الصفر إلى المفتاح الدولي +964)
  let phoneRaw = order.phoneNumber ?? existingOrder?.phoneNumber ?? "";
  if (phoneRaw.startsWith("0")) {
    phoneRaw = "+964" + phoneRaw.slice(1);
  } else if (!phoneRaw.startsWith("+")) {
    phoneRaw = "+" + phoneRaw;
  }

  // 3. معالجة السعر (الأسعار المكتوبة بالاختصار تُضرب في 1000)
  let rawPrice = Number(order.totalPrice ?? existingOrder?.totalPrice ?? 0);
  let finalModonPrice = rawPrice < 1000 && rawPrice > 0 ? rawPrice * 1000 : rawPrice;

  // 4. دمج المنتجات المطلوبة في نص واحد ليعرف المندوب محتوى الطلب
  let productNames = "طلب إلكتروني";
  if (existingOrder?.orderitems && existingOrder.orderitems.length > 0) {
    productNames = existingOrder.orderitems.map((i: any) => i.name).join(" + ");
  }

  // 5. استدعاء API لإنشاء الطلب
  const modonRes = await sendOrderToModon({
    client_name: order.fullName ?? existingOrder?.fullName ?? "",
    client_mobile: phoneRaw,
    city_id: cityId,
    region_id: "1",
    location: order.address ?? existingOrder?.address ?? undefined,
    items_number: existingOrder?.quantity ?? 1,
    price: finalModonPrice,
    type_name: productNames,
    merchant_notes: order.notes ?? existingOrder?.notes ?? undefined,
  });

  // 6. حفظ بوليصة مدن (QR ID) في النظام محلياً
  const qrIdStr = modonRes?.data?.qr_id || modonRes?.qr_id;
  if (qrIdStr) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        modonQrId: String(qrIdStr),
        modonSentAt: new Date(),
      },
    });
  }
}
```

### 1.1. شرح السطر الخاص بترجمة المحافظة
في الكود أعلاه، ستلاحظ هذا السطر المكتوب بطريقة مختصرة:
```typescript
const cityId = MODON_CITY_MAP[order.governorate ?? existingOrder?.governorate ?? ""] ?? "1";
```
يعتمد هذا السطر على معامل **Nullish Coalescing (`??`)** لضمان عدم حدوث خطأ برمجي، ويعمل كالآتي:
1. **`order.governorate`**: يحاول الكود أولاً قراءة اسم المحافظة من البيانات المحدثة التي أرسلها المستخدم للتو (لو كان أرسل تعديل للمحافظة).
2. **`existingOrder?.governorate`**: في حال لم يرسل المستخدم محافظة جديدة (كانت القيمة `null` أو `undefined`)، سيتراجع الكود ويستخدم المحافظة القديمة المحفوظة بالفعل في واجهة قاعدة البيانات `existingOrder`.
3. **`""`**: لو كان الاثنان فارغين، سيستخدم نصاً فارغاً لتبسيط الأمر.
4. **`MODON_CITY_MAP[...]`**: يأخذ الاسم الناتج (مثلاً "أربيل" أو "البصرة") ويبحث عن القيمة المقابلة له داخل الخريطة (التي حولت الأسماء إلى أرقام تعتمدها مدن).
5. **`... ?? "1"`**: في النهاية، إن لم يجد اسم المحافظة في الخريطة نهائياً، سيتم إسناد القيمة `"1"` كقيمة افتراضية لضمان نجاح الطباعة، وتمثل رقم `"1"` محافظة **بغداد** في نظام مدن.

### 2. دالة الاتصال بمدن (sendOrderToModon)
تأخذ هذه الدالة الموجودة في `lib/modon/api.ts` البيانات وتُرسلها كـ `FormData` عبر طلب `POST` إلى سِيرفر شركة مدن.

```typescript
export async function sendOrderToModon(order: SendOrderParams) {
  const form = new FormData();
  form.append("client_name", order.client_name);
  form.append("client_mobile", order.client_mobile);
  // يجب إرسال id المحافظة وليس اسمها النصّي
  form.append("city_id", String(order.city_id)); 
  form.append("region_id", String(order.region_id));
  if (order.location) form.append("location", order.location);
  form.append("items_number", String(order.items_number));
  form.append("price", String(order.price));

  // إرفاق الحقول الإجبارية الخفية في مدن
  if (!form.has("type_name")) form.append("type_name", "طلب جديد");
  if (!form.has("replacement")) form.append("replacement", "0");
  if (!form.has("package_size")) form.append("package_size", "1");

  try {
    const res = await fetch(
      `https://mcht.modon-express.net/v1/merchant/create-order?token=${getToken()}`,
      { method: "POST", body: form }
    );

    const bodyText = await res.text();
    const data = JSON.parse(bodyText);

    return data; // يحتوي على الـ qr_id وتأكيد الاستلام
  } catch (err) {
    console.error("[Modon] create-order error:", err);
    return null;
  }
}
```

---

## الاتجاه الثاني: المزامنة وتحديث حالة الطلبات من مدن
نحتاج إلى معرفة ما إذا كانت الطلبات قد تم توصيلها للعميل بنجاح (Delivered) أو اُرجعت (Returned). هذه العملية مجدولة للعمل التلقائي.

### 1. نقطة استلام الـ (Cron Job)
في `app/api/modon/sync/route.ts` أنشأنا واجهة للوصول برمجياً لها أقصى مدة معالجة `maxDuration = 60` لتدعم المهام الخلفية، تقوم باستدعاء دالة `syncModonOrders`.

```typescript
import { NextResponse } from "next/server";
import { syncModonOrders } from "@/lib/actions/order.actions";

export const maxDuration = 60; // 60 seconds limit
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // التأكد من الحماية حتى لا يستدعيها مستخدم غير مخوّل
    const authHeader = req.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await syncModonOrders();

    return NextResponse.json({
      success: true,
      message: res.message,
      updated: res.updatedOrders,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### 2. جلب الطلبات من مدن (fetchModonOrders)
يقوم النظام بالتوجه لرابط الـ API الخاص بمدن لتحميل كافة الطلبات الحالية للتاجر `merchant-orders`. يتم ذلك من `lib/modon/api.ts`:

```typescript
export async function fetchModonOrders() {
  try {
    const res = await fetch(
      `https://mcht.modon-express.net/v1/merchant/merchant-orders?token=${getToken()}`,
      { cache: "no-store" } // يجب عدم استخدام الـ Cache للحصول على بيانات حية دائمًا
    );
    const data = await res.json();
    return Array.isArray(data) ? data : data?.data ?? [];
  } catch (err) {
    return [];
  }
}
```

### 3. مطابقة البيانات (syncModonOrders)
أخيراً، دالة المعالجة والمطابقة الفعلية الموجودة في `lib/actions/order.actions.ts`. تعمل هذه الدالة على جلب الطلبات النشطة محلياً، والبحث عن حالاتها في البيانات القادمة من شركة مدن.

```typescript
export async function syncModonOrders() {
  // 1. جلب بيانات مدن الحية
  const modonOrders = await fetchModonOrders();
  
  if (!modonOrders || modonOrders.length === 0) {
    return { success: false, message: "لا توجد طلبات في مدن للمزامنة", updatedOrders: 0 };
  }

  // 2. تصفية طلباتنا المحلية بحثاً عن الطلبات النشطة فقط والتي تملك QR
  const localOrders = await prisma.order.findMany({
    where: {
      modonQrId: { not: null },
      status: { notIn: ["completed", "returned"] },
    },
    select: { id: true, modonQrId: true, status: true },
  });

  let updatedCount = 0;

  // 3. مقارنة الحالات وتحديثها
  for (const localOrder of localOrders) {
    // العثور على نفس الطلب ضمن طلبات مدن عبر بوليصة الـ QR
    const remoteOrder = modonOrders.find(
      (o: any) => String(o.qr_id) === localOrder.modonQrId
    );

    if (remoteOrder && remoteOrder.status) {
      // تحويل حالة مدن لمصطلحات النظام. مثال: 
      // Delivered -> completed
      // Returned -> returned
      // In Transit -> pending
      const newLocalStatus = MODON_STATUS_MAP[remoteOrder.status];
      
      // التحديث إن وجد اختلاف بين الحالة في نظامنا وفي شركة مدن
      if (newLocalStatus && newLocalStatus !== localOrder.status) {
        await prisma.order.update({
          where: { id: localOrder.id },
          data: { status: newLocalStatus },
        });
        updatedCount++;
      }
    }
  }

  return {
    success: true,
    message: `تم التزامن وتحديث حالة ${updatedCount} طلب بنجاح.`,
    updatedOrders: updatedCount,
  };
}
```

---
**الخلاصة:**
كل هذه المنظومة تعمل بانسجام في الخلفية. عندما تُغير حالة طلب إلى 'pending' يصبح الطلب في نظام شركة مدن فوراً، ويستمر الـ Cron job الدوري بالتقاط التحديثات التي يقوم بها المندوب وتنعكس هذه التحديثات على ألوان وحالات الطلب في لوحة تحكم متجرك.
