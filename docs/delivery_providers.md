# طبقة شركات التوصيل (Delivery Providers)

النظام يدعم أكثر من شركة توصيل خلف **واجهة موحّدة**. الشركة الفعّالة تُختار من
`.env` عبر `DELIVERY_PROVIDER`، فيبقى منطق الطلبات في `lib/actions/order.actions.ts`
موحّداً ولا يعرف بأي شركة يتعامل.

```env
DELIVERY_PROVIDER=modon   # أو prime
```

## البنية

```text
lib/delivery/
  types.ts              ← الواجهة DeliveryProvider + الأنواع المشتركة
  index.ts              ← getDeliveryProvider() يقرأ DELIVERY_PROVIDER
  providers/modon.ts    ← مدن إكسبريس (جاهز)
  providers/prime.ts    ← برايم (المصادقة جاهزة، بقية النقاط بانتظار التوثيق)
```

كل شركة تنفّذ الواجهة:

| الدالة | الغرض |
|---|---|
| `sendOrder(input)` | إرسال طلب جديد → `{ success, trackingId, error }` |
| `fetchRemoteOrders()` | جلب طلبات التاجر مُطبَّعة (للمزامنة والإحصاءات) |

طبقة الطلبات تستدعي `getDeliveryProvider().sendOrder(...)` عند تحويل الطلب إلى
`pending`، وتخزّن `trackingId` الراجع في العمود (الفعلي) `modonQrId`.

## حقول قاعدة البيانات

أعمدة `Order` العامة (أسماء الأعمدة الفعلية بقيت `modon*` عبر `@map`، فلا ترحيل بيانات):

| حقل الكود | العمود الفعلي |
|---|---|
| `deliveryTrackingId` | `modonQrId` |
| `deliveryRawStatus` | `modonStatus` |
| `deliverySentAt` | `modonSentAt` |
| `deliveryCollectedPrice` | `modonCollectedPrice` |

> `@map` لا يغيّر اسم العمود في قاعدة البيانات، لذا لا حاجة لأي migration.

## حالة تكامل برايم — مكتمل (مُتحقَّق مقابل سيرفر dev)

Base URL يتضمّن `/webapi` (مثال dev: `https://devtest.prime-iq.com/myp/webapi`).

**منفّذ ومُتحقَّق في `prime.ts`:**
- **المصادقة** `POST /auth/external-system-login` → التوكن في حقل **`accessToken`** (مع كاش).
- **إنشاء الطلب** `POST /external/create-shipments` (جسم = مصفوفة شحنات). الرد خريطة
  `{ "<shipmentId>": <shipmentId> }` — نخزّن القيمة كـ `deliveryTrackingId`.
  الهاتف يُرسَل بالصيغة المحلية (`07…`)، والمحافظة تُحوّل لرمز الولاية.
- **المزامنة** `POST /external/shipments-info` (جسم = مصفوفة أرقام الشحنات المخزّنة عندنا).
  نقرأ `caseid` (المطابقة) و`stepCode`/`shipmentStatus` (الحالة) و`receiptAmtIqd` (المبلغ).
- **خريطة الولايات** `PRIME_STATE_MAP` و**خريطة الحالات** `PRIME_STATUS_MAP` مملوءتان فعلياً
  من `/general/states` و `/external/list-of-system-steps`.
- endpoint تشخيص `GET /api/prime/debug` (أدمن) يطبع الولايات/الحالات/متاجر التاجر.

**خريطة الحالات المعتمدة (code → نظامنا):**
`DLEIVERD/SUCCARCHV/SUCC_CHANGEPRICE/PART_SUCC/FORCE_DLV → completed` ·
`RTN_WITHAGENT → failed` · `POSTPONED/TRY_AGAIN/RESENEDSHIPMENTS → rescheduled` ·
`RTN_INSTORE/RTNARCHV → returned` · `RETURNED_TO_CUSTOMER → returnReceived`.
أي حالة أخرى (قيد التوصيل/المخزن) تُترك دون تغيير.

**متغيّرات البيئة:**

```env
PRIME_BASE_URL=https://prime-iq.com/myp/webapi   # الإنتاج (يتضمّن /webapi)
PRIME_LOGIN=JOYSTORE
PRIME_PASSWORD=********
PRIME_INITIAL_TOKEN=********
PRIME_MERCHANT_LOGIN_ID=...   # معرّف التاجر تحت حساب التكامل
PRIME_SENDER_ID=...           # رقم المتجر senderId — من merchant-shops/{المعرّف}
```

> سيرفر الاختبار: `https://devtest.prime-iq.com/myp/webapi` (حساب `TEST_INT`).

**يتبقّى (إعداد جهة برايم — ليس كوداً):**
حساب JOYSTORE حساب **تكامل** وليس تاجراً، ولا يوجد تاجر/متجر مُسجَّل تحته بعد
(قائمة `/external/merchants` فارغة)، لذلك **لا يتوفّر `senderId`** لإنشاء الشحنات.
يجب أولاً تسجيل تاجر + متجر تحت JOYSTORE (عبر دعم برايم، أو
`POST /external/create-merchant` ثم `create-merchant-shop`)، ثم:
1. ضع معرّف التاجر في `PRIME_MERCHANT_LOGIN_ID`.
2. شغّل `GET /api/prime/debug` → خذ `senderId` من `merchantShops` → `PRIME_SENDER_ID`.
3. ثم `DELIVERY_PROVIDER=prime`.
