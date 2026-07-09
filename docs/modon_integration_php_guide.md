# دليل شامل لربط API مع شركة مدن للتوصيل (Modon Express) — نسخة PHP

> هذا الملف يشرح **من الصفر** كيف تربط نظامك مع شركة "مدن إكسبريس" للتوصيل في العراق:
> من أين تحصل على التوكن، ما هي روابط الـ API، كيف ترسل طلباً، وكيف تتابع حالته تلقائياً.
> الأمثلة مكتوبة بـ **PHP (cURL)** لأنها اللغة التي تعمل بها، لكن المنطق واحد في أي لغة.
> الشرح مبني على تطبيق فعلي يعمل في الإنتاج (مكتوب أصلاً بـ Next.js).

---

## 0) نظرة عامة سريعة على طريقة الربط

التواصل مع مدن بسيط جداً تقنياً، وله 3 خصائص يجب أن تفهمها قبل أي شيء:

| الخاصية | القيمة |
|---|---|
| **Base URL** | `https://mcht.modon-express.net/v1` |
| **طريقة المصادقة (Auth)** | عبر **التوكن في رابط الطلب (query param)**: `?token=YOUR_TOKEN` — وليس عبر Header |
| **صيغة إرسال البيانات** | `multipart/form-data` (أي `FormData` / حقول POST عادية، وليس JSON) |
| **صيغة الاستقبال** | JSON |

> ⚠️ نقطة مهمة جداً: المصادقة **ليست** عبر `Authorization: Bearer`. التوكن يُرسل دائماً كـ **باراميتر في الرابط** مع كل طلب. مثال:
> `https://mcht.modon-express.net/v1/merchant/create-order?token=ضع_التوكن_هنا`

الربط يعمل في **اتجاهين**:

1. **من نظامك → مدن:** ترسل بيانات الطلب فيُنشئ مدن بوليصة (لها رقم تعريفي يسمى `qr_id`). يحدث هذا تلقائياً عند تحويل حالة الطلب إلى "قيد الانتظار/pending".
2. **من مدن → نظامك (المزامنة):** كل فترة (مثلاً كل 30 دقيقة) تسحب قائمة طلباتك من مدن وتقرأ `status_id` لكل طلب وتُحدّث حالته في قاعدة بياناتك (تم التوصيل، راجع، مؤجل... إلخ).

---

## 1) كيف تحصل على التوكن (Token)؟

التوكن **لا يُولَّد برمجياً** عبر API تسجيل دخول. بل تحصل عليه **يدوياً مرة واحدة** كالتالي:

1. تسجّل كـ **تاجر (Merchant)** لدى شركة مدن إكسبريس وتُفعّل حسابك معهم.
2. تطلب منهم (من فريق الدعم / لوحة التاجر) **توكن الـ API** الخاص بحسابك.
3. تحصل على سلسلة نصية ثابتة، مثل: `85e9f7b47ec62af2ade1946df6737ed3` (مجرد مثال للشكل).
4. **تخزّنه كمتغيّر بيئة (Environment Variable)** ولا تكتبه داخل الكود مطلقاً.

في مشروعنا خزّنّاه في ملف `.env`:

```env
MODON_TOKEN=ضع_توكنك_هنا
```

وفي PHP تقرأه هكذا (مثلاً عبر مكتبة `vlucas/phpdotenv` أو `getenv`):

```php
<?php
// config.php
define('MODON_BASE', 'https://mcht.modon-express.net/v1');
define('MODON_TOKEN', getenv('MODON_TOKEN')); // اقرأه من البيئة، لا تكتبه هنا

function modon_url(string $path): string {
    // يضيف التوكن تلقائياً لأي endpoint
    return MODON_BASE . $path . '?token=' . MODON_TOKEN;
}
```

> 🔒 التوكن سرّي تماماً. أي شخص يملكه يستطيع إنشاء طلبات باسمك. لا ترفعه إلى GitHub ولا تضعه في الـ frontend.

---

## 2) قائمة الـ Endpoints المستخدمة

| # | الغرض | Method | المسار |
|---|---|---|---|
| 1 | جلب قائمة المحافظات/المدن (city_id) | `GET` | `/merchant/citys` |
| 2 | جلب قائمة المناطق (region_id) | `GET` | `/merchant/regions` |
| 3 | **إنشاء طلب جديد** | `POST` | `/merchant/create-order` |
| 4 | **جلب كل طلبات التاجر** (للمزامنة) | `GET` | `/merchant/merchant-orders` |
| 5 | تعديل طلب موجود | `POST` | `/merchant/edit-order` |

كلها تأخذ `?token=YOUR_TOKEN`.

---

## 3) دالة مساعدة عامة لإرسال الطلبات (PHP)

قبل أي شيء، اصنع دالتين مساعدتين: واحدة لطلبات `GET` وأخرى لطلبات `POST` بصيغة `form-data`.

```php
<?php
// modon_http.php
require_once 'config.php';

/** طلب GET يُعيد مصفوفة JSON مفكوكة */
function modon_get(string $path): array {
    $ch = curl_init(modon_url($path));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $code >= 400) {
        error_log("[Modon] GET $path failed: HTTP $code");
        return [];
    }
    $data = json_decode($body, true);
    return is_array($data) ? $data : [];
}

/** طلب POST بصيغة multipart/form-data — هذا ما تتوقعه مدن */
function modon_post(string $path, array $fields): ?array {
    $ch = curl_init(modon_url($path));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        // تمرير مصفوفة (وليس http_build_query) يجعل cURL يرسلها كـ multipart/form-data
        CURLOPT_POSTFIELDS     => $fields,
        CURLOPT_TIMEOUT        => 30,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false) {
        error_log("[Modon] POST $path: no response");
        return null;
    }
    $data = json_decode($body, true);
    if ($data === null) {
        // أحياناً يرجّع HTML/نص عند الخطأ — سجّله ولا تتجاهله
        error_log("[Modon] POST $path non-JSON (HTTP $code): $body");
        return null;
    }
    return $data;
}
```

> 💡 الحيلة المهمة في PHP: إذا مرّرت **مصفوفة PHP** مباشرة لـ `CURLOPT_POSTFIELDS`، فإن cURL يرسلها تلقائياً كـ `multipart/form-data` — وهو بالضبط ما تتوقعه مدن. لو استخدمت `http_build_query()` فستُرسل كـ `x-www-form-urlencoded` وقد لا تُقبل بنفس الطريقة. التزم بتمرير المصفوفة.

---

## 4) الاتجاه الأول: إنشاء طلب في مدن

### 4.1 الحقول التي يقبلها `create-order`

| الحقل | إجباري؟ | الوصف |
|---|---|---|
| `client_name` | ✅ | اسم الزبون |
| `client_mobile` | ✅ | رقم هاتف الزبون بصيغة دولية `+964...` |
| `city_id` | ✅ | **رقم** المحافظة في نظام مدن (ليس الاسم) |
| `region_id` | ✅ | **رقم** المنطقة داخل المحافظة |
| `items_number` | ✅ | عدد القطع |
| `price` | ✅ | السعر الكلي بالدينار العراقي **كاملاً** (مثل `25000` وليس `25`) |
| `location` | اختياري | أقرب نقطة دالة / العنوان النصّي |
| `type_name` | شبه إجباري | نوع/محتوى البضاعة (نضع فيه أسماء المنتجات) |
| `package_size` | شبه إجباري | حجم الطلب — نرسل `"1"` (عادي) افتراضياً |
| `replacement` | شبه إجباري | `0` = طلب جديد، `1` = استبدال |
| `merchant_notes` | اختياري | ملاحظات التاجر للمندوب |

> الحقول "شبه الإجبارية" (`type_name`, `package_size`, `replacement`) قد يرفض السيرفر الطلب بدونها، لذلك **نضع لها قيماً افتراضية دائماً** كاحتياط.

### 4.2 الرد عند النجاح / الفشل

- **نجاح:** يرجّع JSON يحتوي على رقم البوليصة. قد يأتي بأحد الشكلين:
  - `{ "data": { "qr_id": "123456", ... } }`
  - أو `{ "qr_id": "123456", ... }`
  - لذلك نقرأه دائماً هكذا: `$qrId = $res['data']['qr_id'] ?? $res['qr_id'] ?? null;`
- **فشل تحقّق (validation):** يرجّع `{ "status": false, "msg": "سبب الخطأ" }`.

> ⚠️ **احفظ `qr_id` في قاعدة بياناتك** مرتبطاً بالطلب المحلي. هذا الرقم هو المفتاح الذي ستطابق به لاحقاً أثناء المزامنة. عندنا الحقل اسمه `modonQrId`.

### 4.3 التحويلات الثلاثة المهمة قبل الإرسال

هذه أهم نقطة في كل الربط — **بيانات نظامك لا تُرسل كما هي**، بل تمرّ بثلاث معالجات:

#### (أ) تحويل اسم المحافظة → `city_id` رقمي
مدن لا تفهم "بغداد" أو "البصرة"، بل تفهم أرقاماً. لذلك نحتفظ بخريطة ثابتة (استخرجناها مرة واحدة من `GET /merchant/citys`). إن لم نجد المحافظة في الخريطة نستخدم `"1"` (بغداد) كقيمة افتراضية حتى لا يفشل الطلب.

#### (ب) تنسيق رقم الهاتف → صيغة دولية
- إذا بدأ الرقم بـ `0` (مثل `07701234567`) → نحذف الصفر ونضع `+964` → `+9647701234567`.
- إذا لم يبدأ بـ `+` أصلاً → نضيف `+` في أوله.

#### (ج) تصحيح السعر (×1000)
في نظامنا الأسعار مخزّنة أحياناً بالـ "ألوف المختصرة" (مثلاً `25` تعني 25 ألف دينار)، بينما مدن تريد المبلغ كاملاً. القاعدة: **إذا كان السعر أكبر من 0 وأقل من 1000، اضربه في 1000**. (`25` → `25000`، أما `30000` فتبقى كما هي).

> ملاحظة: هذه القاعدة خاصة بطريقة تخزيننا للأسعار. لو كان نظامك يخزّن المبلغ الكامل أصلاً، فتجاهل هذه الخطوة وأرسل السعر كما هو.

### 4.4 الكود الكامل بـ PHP لإنشاء الطلب

```php
<?php
// modon_create_order.php
require_once 'modon_http.php';
require_once 'modon_maps.php'; // الخرائط في القسم 6

/**
 * يأخذ بيانات طلب من نظامك ويرسله لمدن.
 * يُعيد qr_id عند النجاح أو null عند الفشل.
 */
function send_order_to_modon(array $order): ?string {

    // (أ) المحافظة → رقم
    $cityId = MODON_CITY_MAP[trim($order['governorate'] ?? '')] ?? '1';

    // المنطقة الافتراضية ("أخرى") لتلك المحافظة
    $regionId = MODON_REGION_MAP[$cityId] ?? $cityId;

    // (ب) تنسيق رقم الهاتف
    $phone = $order['phone'] ?? '';
    if (str_starts_with($phone, '0')) {
        $phone = '+964' . substr($phone, 1);
    } elseif (!str_starts_with($phone, '+')) {
        $phone = '+' . $phone;
    }

    // (ج) تصحيح السعر
    $rawPrice = (float)($order['total_price'] ?? 0);
    $price = ($rawPrice > 0 && $rawPrice < 1000) ? $rawPrice * 1000 : $rawPrice;

    // محتوى الطلب = أسماء المنتجات مفصولة بـ "+"
    $typeName = !empty($order['product_names'])
        ? implode(' + ', $order['product_names'])
        : 'طلب إلكتروني';

    // تجهيز الحقول (multipart/form-data)
    $fields = [
        'client_name'   => $order['client_name'] ?? '',
        'client_mobile' => $phone,
        'city_id'       => (string)$cityId,
        'region_id'     => (string)$regionId,
        'items_number'  => (string)($order['items_number'] ?? 1),
        'price'         => (string)$price,
        'type_name'     => $typeName,
        // الحقول الإجبارية الخفية — قيم افتراضية دائماً
        'package_size'  => '1',
        'replacement'   => '0',
    ];
    if (!empty($order['address'])) $fields['location'] = $order['address'];
    if (!empty($order['notes']))   $fields['merchant_notes'] = $order['notes'];

    // الإرسال
    $res = modon_post('/merchant/create-order', $fields);

    if ($res === null) return null;

    // فشل تحقّق من جهة مدن
    if (isset($res['status']) && $res['status'] === false) {
        error_log('[Modon] create-order rejected: ' . json_encode($res, JSON_UNESCAPED_UNICODE));
        return null;
    }

    // قراءة qr_id من أيٍّ من الشكلين الممكنين
    $qrId = $res['data']['qr_id'] ?? $res['qr_id'] ?? null;
    return $qrId ? (string)$qrId : null;
}
```

### 4.5 متى نستدعي هذه الدالة؟

نستدعيها **لحظة تحويل حالة الطلب إلى "pending"** (وقبلها لم يكن pending، ولا يملك `qr_id` بعد) لتجنّب الإرسال المكرر:

```php
<?php
// عند تحديث حالة الطلب في لوحة الإدارة:
if ($newStatus === 'pending' && $oldStatus !== 'pending' && empty($order['modon_qr_id'])) {
    $qrId = send_order_to_modon([
        'client_name'   => $order['full_name'],
        'phone'         => $order['phone_number'],
        'governorate'   => $order['governorate'],
        'address'       => $order['address'],
        'items_number'  => $order['quantity'],
        'total_price'   => $order['total_price'],
        'product_names' => $order['product_names'], // مصفوفة أسماء
        'notes'         => $order['notes'],
    ]);

    if ($qrId) {
        // خزّن البوليصة + وقت الإرسال في قاعدة بياناتك
        db_update_order($order['id'], [
            'modon_qr_id'   => $qrId,
            'modon_sent_at' => date('Y-m-d H:i:s'),
        ]);
    }
}
```

---

## 5) الاتجاه الثاني: مزامنة الحالات من مدن

الهدف: معرفة أي الطلبات تم توصيلها أو رجعت أو تأجلت، تلقائياً، دون متابعة يدوية.

### 5.1 جلب طلبات التاجر

```php
<?php
// modon_fetch.php
require_once 'modon_http.php';

function fetch_modon_orders(): array {
    $data = modon_get('/merchant/merchant-orders');
    // الرد قد يكون مصفوفة مباشرة أو { data: [...] }
    if (isset($data['data']) && is_array($data['data'])) return $data['data'];
    return is_array($data) ? $data : [];
}
```

كل عنصر في القائمة يحتوي (الحقول المهمة لنا):

| الحقل | الوصف |
|---|---|
| `id` أو `qr_id` | رقم البوليصة — به نطابق الطلب المحلي |
| `status_id` | **رقم** حالة الطلب الحالية لدى مدن — هذا أهم حقل |
| `price` | المبلغ المُحصَّل (بالدينار الكامل) |

> 💡 نصيحة عملية: قبل أن تكتب منطق المزامنة، اعمل endpoint بسيط للتشخيص يطبع أول طلبين كاملين كما يردّهما مدن (`var_dump($orders)`) لتتأكد من أسماء الحقول الفعلية، لأنها قد تختلف قليلاً بين الحسابات.

### 5.2 خريطة الحالات (`status_id` → حالة نظامك)

مدن ترجع رقم حالة (`status_id`). نحوّله إلى مصطلحات نظامنا عبر خريطة. هذه هي الخريطة الفعلية المستخدمة عندنا (مع معاني الأرقام):

| `status_id` | معناه عند مدن | حالة نظامنا |
|---|---|---|
| `4`  | تم تسليم الطلب للزبون | `completed` |
| `21` | تم التسليم واستلام مبلغ الاسترجاع | `completed` |
| `15` | إرجاع الطلب للعميل (التاجر) | `returned` |
| `19` | إرجاع بعد الاستلام | `returned` |
| `17` | تم استلامه من قبل التاجر | `returnReceived` |
| `29` | تأجيل من قبل الزبون | `rescheduled` |
| `30` | تأجيل لوقت غير معروف | `rescheduled` |
| `14` | سيُعاد إرساله للزبون | `rescheduled` |
| `44` | سيُعاد إرسال الطلب | `rescheduled` |
| `25` | لم يتم الرد من الزبون | `failed` |
| `26` | لم يتم الرد بعد الاتفاق | `failed` |
| `27` | رقم الهاتف مغلق | `failed` |
| `28` | الهاتف مغلق بعد الاتفاق | `failed` |
| `31` | ألغى الزبون الطلب مسبقاً | `failed` |
| `32` | رفض الزبون الطلب | `failed` |
| `38` | عنوان الزبون غير دقيق | `failed` |
| `39` | الزبون لم يطلب | `failed` |
| `41` | لا يمكن الاتصال بالزبون | `failed` |

> أي `status_id` غير موجود في الخريطة (مثلاً "قيد التوصيل") نتجاهله ونترك حالة الطلب كما هي.

### 5.3 دالة المزامنة الكاملة بـ PHP

```php
<?php
// modon_sync.php
require_once 'modon_fetch.php';
require_once 'modon_maps.php';

function sync_modon_orders(): array {
    $modonOrders = fetch_modon_orders();
    if (empty($modonOrders)) {
        return ['success' => false, 'message' => 'لا توجد طلبات في مدن', 'updated' => 0];
    }

    // طلباتنا المحلية التي لها qr_id وليست منتهية نهائياً
    $localOrders = db_query(
        "SELECT id, modon_qr_id, status FROM orders
         WHERE modon_qr_id IS NOT NULL
           AND status NOT IN ('completed', 'returnReceived')"
    );

    // فهرسة طلبات مدن حسب المعرّف لتسريع البحث
    $byId = [];
    foreach ($modonOrders as $o) {
        $key = (string)($o['id'] ?? $o['qr_id'] ?? '');
        if ($key !== '') $byId[$key] = $o;
    }

    $updated = 0;
    foreach ($localOrders as $local) {
        $remote = $byId[(string)$local['modon_qr_id']] ?? null;
        if (!$remote || !isset($remote['status_id'])) continue;

        $newStatus = MODON_STATUS_MAP[(string)$remote['status_id']] ?? null;
        if ($newStatus && $newStatus !== $local['status']) {
            $fields = ['status' => $newStatus];

            // عند التوصيل: احفظ المبلغ المُحصَّل (مقسوماً على 1000 ليطابق تخزيننا)
            if ($newStatus === 'completed' && isset($remote['price'])) {
                $fields['modon_collected_price'] = (float)$remote['price'] / 1000;
            }

            db_update_order($local['id'], $fields);
            $updated++;
        }
    }

    return ['success' => true, 'message' => "تم تحديث $updated طلب", 'updated' => $updated];
}
```

> ⚠️ ملاحظة دقيقة من تجربتنا: نحن نخزّن `qr_id` القادم من ردّ `create-order`، لكن عند المزامنة نطابق على `id ?? qr_id` من ردّ `merchant-orders`. لذلك في المطابقة استخدمنا `(string)($o['id'] ?? $o['qr_id'])`. تأكد بنفسك من أي حقل يطابق `qr_id` المحفوظ لديك عبر endpoint التشخيص في 5.1.

### 5.4 جدولة المزامنة التلقائية (Cron)

عندنا (على Vercel) تُستدعى المزامنة كل 30 دقيقة عبر ملف `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/modon/sync", "schedule": "*/30 * * * *" }
  ]
}
```

في PHP العادي (على سيرفر Linux/cPanel) تعملها عبر **crontab**. أنشئ ملف `cron_modon.php`:

```php
<?php
// cron_modon.php — يُنفَّذ من الـ crontab
require_once 'modon_sync.php';
$res = sync_modon_orders();
echo json_encode($res, JSON_UNESCAPED_UNICODE);
```

ثم في crontab (كل 30 دقيقة):

```cron
*/30 * * * * /usr/bin/php /var/www/html/cron_modon.php >> /var/log/modon_sync.log 2>&1
```

> 🔒 **حماية endpoint المزامنة:** لو جعلتها HTTP endpoint عاماً بدل سكربت CLI، احمِها بسرّ (secret) حتى لا يستدعيها أي أحد. عندنا نتحقق من Header:
> ```php
> $secret = getenv('CRON_SECRET');
> $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
> if ($auth !== "Bearer $secret") { http_response_code(401); exit('Unauthorized'); }
> ```
> ويُرسَل بـ: `Authorization: Bearer YOUR_CRON_SECRET`.

---

## 6) ملف الخرائط (المحافظات + المناطق + الحالات)

ضع هذه الثوابت في ملف واحد `modon_maps.php`. القيم مستخرَجة فعلياً من `GET /merchant/citys` و `GET /merchant/regions`.

```php
<?php
// modon_maps.php

// اسم المحافظة (عربي/إنجليزي) → city_id في مدن
const MODON_CITY_MAP = [
    'Baghdad' => '1',  'بغداد' => '1',
    'Karbala' => '2',  'كربلاء' => '2',
    'Anbar' => '3',    'الانبار' => '3',  'الأنبار' => '3',
    'Babylon' => '4',  'بابل' => '4',     'الحلة' => '4',  'الحلة - بابل' => '4',
    'Basra' => '5',    'البصرة' => '5',
    'Dohuk' => '6',    'دهوك' => '6',
    'Diyala' => '7',   'ديالى' => '7',
    'Erbil' => '8',    'اربيل' => '8',    'أربيل' => '8',
    'Kirkuk' => '9',   'كركوك' => '9',
    'Maysan' => '10',  'ميسان' => '10',   'العمارة' => '10', 'العمارة - ميسان' => '10',
    'Muthanna' => '11','المثنى' => '11',  'السماوة' => '11', 'السماوة - المثنى' => '11',
    'Najaf' => '12',   'النجف' => '12',
    'Nineveh' => '13', 'نينوى' => '13',   'الموصل' => '13',
    'Qadisiyah' => '14','القادسية' => '14','الديوانية' => '14', 'الديوانية - القادسية' => '14',
    'Saladin' => '15', 'صلاح الدين' => '15',
    'Sulaymaniyah' => '16', 'السليمانية' => '16',
    'Dhi Qar' => '17', 'ذي قار' => '17',  'الناصرية' => '17', 'الناصرية - ذي قار' => '17',
    'Wasit' => '18',   'واسط' => '18',    'الكوت' => '18',  'الكوت - واسط' => '18',
];

// city_id → region_id الافتراضية (منطقة "أخرى" لكل محافظة)
const MODON_REGION_MAP = [
    '1' => '5755', '2' => '5407', '3' => '5408', '4' => '5409',
    '5' => '5429', '6' => '5411', '7' => '5746', '8' => '5413',
    '9' => '5414', '10' => '5426','11' => '5753','12' => '5417',
    '13' => '5418','14' => '5419','15' => '5420','16' => '5421',
    '17' => '5428','18' => '5423',
];

// status_id من مدن → حالة نظامك
const MODON_STATUS_MAP = [
    '4' => 'completed',  '21' => 'completed',
    '15' => 'returned',  '19' => 'returned',
    '17' => 'returnReceived',
    '29' => 'rescheduled','30' => 'rescheduled','14' => 'rescheduled','44' => 'rescheduled',
    '25' => 'failed','26' => 'failed','27' => 'failed','28' => 'failed',
    '31' => 'failed','32' => 'failed','38' => 'failed','39' => 'failed','41' => 'failed',
];
```

> 🔁 **كيف تحصل على هذه الأرقام لحسابك أنت؟** القيم أعلاه من حسابنا، لكن يُفضّل أن تتأكد منها لحسابك مرة واحدة:
> - `GET /merchant/citys?token=...` → يعطيك قائمة المحافظات مع `city_id`.
> - `GET /merchant/regions?token=...` → يعطيك المناطق مع `region_id` لكل محافظة.
> اطبع نتيجتيهما مرة واحدة واملأ الخرائط منهما.

---

## 7) (اختياري) تعديل طلب موجود

لو احتجت تعديل طلب أُرسل بالفعل (تستخدم `qr_id`):

```php
<?php
function edit_modon_order(string $qrId, array $changes): ?array {
    $fields = ['qr_id' => $qrId];
    foreach ($changes as $k => $v) {
        if ($v !== null) $fields[$k] = (string)$v;
    }
    return modon_post('/merchant/edit-order', $fields);
}
```

---

## 8) حقول قاعدة البيانات المطلوبة في نظامك

أضف هذه الأعمدة على جدول الطلبات لديك (هذه هي التي نستخدمها):

| العمود | النوع | الغرض |
|---|---|---|
| `modon_qr_id` | `VARCHAR` nullable | رقم بوليصة مدن (المفتاح للمطابقة) |
| `modon_status` | `VARCHAR` nullable | (اختياري) آخر حالة خام من مدن |
| `modon_sent_at` | `DATETIME` nullable | وقت إرسال الطلب لمدن |
| `modon_collected_price` | `DECIMAL(12,2)` nullable | المبلغ الذي حصّله المندوب فعلاً |

---

## 9) ملخّص خطوات الربط من البداية للنهاية ✅

1. **احصل على التوكن** من مدن وخزّنه في `MODON_TOKEN` كمتغيّر بيئة.
2. **اضبط الأساسيات:** `Base URL` + إرسال التوكن في الرابط `?token=` + بيانات POST كـ `multipart/form-data`.
3. **جهّز الخرائط** (المحافظات، المناطق، الحالات) مرة واحدة عبر `citys` و `regions`.
4. **أضف أعمدة مدن** لجدول الطلبات (`modon_qr_id` ... إلخ).
5. **عند تحويل الطلب إلى pending:** طبّق التحويلات (محافظة→رقم، هاتف→دولي، سعر×1000)، ثم `POST /merchant/create-order`، واحفظ `qr_id` الراجع.
6. **اجدوِل مزامنة دورية** (كل 30 دقيقة): `GET /merchant/merchant-orders` → طابق بـ `qr_id` → حوّل `status_id` عبر الخريطة → حدّث الحالة (واحفظ المبلغ المُحصَّل عند الاكتمال).
7. **احمِ endpoint المزامنة** بسرّ (`CRON_SECRET`) إن كان عاماً.

> بهذه الخطوات يصبح أي طلب في نظامك ينتقل تلقائياً إلى مدن بمجرد جعله "pending"، وتنعكس تحديثات المندوب (توصيل/إرجاع/تأجيل) على نظامك تلقائياً كل نصف ساعة.
