# Meta (Facebook + Instagram) Publishing & Ads — Build Plan

Goal: from the admin panel, publish a post to a Facebook Page and an Instagram
account, then pick a published post + an ad account and launch an ad — without
leaving the system.

Single business per deployment (matches the per-deployment env + DB topology and
the existing WhatsApp module). All Meta config comes from env vars; all tokens
live server-side only.

## External dependency (blocks production, not development)

The scopes below require **Meta App Review** + Business Verification before they
work for accounts that aren't admins of the app:

`pages_show_list, pages_read_engagement, pages_manage_posts,
business_management, instagram_basic, instagram_content_publish, ads_management,
ads_read`

**In Development mode the app owner's own Page / IG / ad account work with no
review** — so the whole feature is buildable and testable now with the store
owner's own accounts. Review is only needed to remove that restriction.

## Task list

### Phase 0 — Foundation
- [x] `lib/meta/config.ts` — env reader (`getMetaConfig`), Graph version, scope list, redirect URL. Mirrors `getWaConfig`.
- [x] `lib/meta/graph.ts` — thin Graph API GET/POST helpers with typed errors (raw `fetch`, NOT the SDK — the SDK stays for CAPI only; it has TS friction here).
- [x] Prisma: `MetaConnection` — add to `schema.prisma`. Schema is already ahead of `prisma/migrations`, so this is applied with **`npx prisma db push`, run by the store owner** against their own DB (this machine's `.env` points at production — never push from here).
- [x] `/admin/marketing` route + nav entry (admin-only) with a "not configured" state.

### Phase 1 — Connect accounts (OAuth)
- [x] `GET /api/meta/oauth` — build the Facebook login dialog URL with a signed `state`.
- [x] `GET /api/meta/oauth/callback` — exchange code → long-lived user token → list Pages, IG accounts, ad accounts → store.
- [x] Server actions: `getMetaConnection`, `selectPage`, `selectAdAccount`, `disconnectMeta`.
- [x] Connections panel UI: connect/disconnect, show connected assets + token expiry.

### Phase 2 — Publish posts
- [x] Prisma: `SocialPost` (platform, productId?, caption, media, status, fbPostId, igPostId, error).
- [x] `publishToFacebook` — Page photo/feed post via page token.
- [x] `publishToInstagram` — 2-step media container → publish.
- [x] Reuse UploadThing for public image URLs (both APIs require a fetchable URL).
- [x] Composer UI: pick product (prefill images + caption), choose platform(s), publish; posts list.

### Phase 3 — Launch ads from a post
- [x] Prisma: `MetaAdLaunch` (postId, adAccountId, campaign/adset/ad/creative ids, budget, status).
- [x] `launchAd` — Campaign → Ad Set (geo=Iraq, budget, dates) → Creative → Ad, created **PAUSED** for safety.
  - FB Page post: creative via `object_story_id` = `{pageId}_{postId}`.
  - Implemented: boost the **FB Page post** via `object_story_id`; ad placements can include Instagram automatically. Instagram-only posts (no fbPostId) can't be boosted yet — the UI disables the button with a hint to publish to Facebook too.
- [x] Launch dialog UI: objective, daily budget, days; shows the minor-unit amount being sent; ad created PAUSED, activated by the user in Meta Ads Manager.
- [x] Do **NOT** write the ad budget into `AdCampaign`. That table is manual *actual spend* and `getExpenseStatsForPeriod` pro-rates it into real profit; a budget is planned, not spent. Real spend later comes from the Insights API (`/act_{id}/insights`, `spend`), reconciled after the fact — a separate feature.

### Cross-cutting
- [x] OAuth `state` CSRF protection; tokens never sent to the client.
- [x] Token-expiry surfacing + guidance to reconnect.
- [x] English/Arabic strings for the new UI.

## Env vars to add (later, once app is created in Meta)
```
META_APP_ID=
META_APP_SECRET=
META_LOGIN_CONFIG_ID=   # Facebook Login for Business configuration ID (optional)
META_SCOPES=...          # optional; comma-separated. Overrides the default list.
META_OAUTH_REDIRECT=https://<domain>/api/meta/oauth/callback
META_GRAPH_VERSION=v25.0   # optional; defaults in code
```

### Store setup verified on 2026-10-23

- Business portfolio: R5 (`846077269978996`).
- Store app: `goldenray-store-n8n` (`1659118405129311`). Marketing API and
  Facebook Login for Business have been added.
- The owner saved `https://store.al-shafaq03.com/api/meta/oauth/callback` as a
  valid OAuth redirect URI; it was still present after reloading the dashboard.
- Login configuration `Al-Shafaq Store` (`2165961407639540`) was created by the
  owner and verified in the dashboard, including the six inbox permissions below.
  The current callback exchanges a
  **User access token** for a long-lived user token. Select General and User
  access token when creating this configuration; system-user tokens need a
  different callback lifecycle and must not be substituted here.
- Set `META_LOGIN_CONFIG_ID` to the created configuration ID. With this value,
  the authorization URL uses `config_id`; permissions come from the configuration
  instead of a competing `scope` parameter. Existing deployments without the
  variable keep scope-based authorization.
- Set `META_APP_ID` and `META_APP_SECRET` together, from the store app above,
  in this store's deployment only. The currently configured app ID
  `2472639826899698` belongs to a different project according to the owner.
  Do not reuse its secret with the new ID or alter the other project.
- Local credential installation, login consent, and callback success have now
  been verified (see the live verification below). Production deployment
  configuration remains unchanged.

The Page/Instagram ownership requests and account selection are separate from
application setup. Do not select `moder.nwatches` for this store: the intended
Instagram account is `golden_ray99`. Spend import must later be restricted to
explicitly chosen store ad accounts.

### Social inbox (local implementation; read access verified)

`/ar/admin/social-inbox` reads conversations, message history, posts, comments,
and comment replies directly from Graph using each authorized Page's own token.
The administrator chooses the Page and Facebook/linked Instagram separately.
Every list supports cursor pagination. There is no silent first-50/100 cutoff.
Search and conversation filters apply to the loaded results, as labelled in UI.
Optional refresh runs every 30 seconds while the tab is visible; no webhook or
background history archive is configured by this feature.

The inbox keeps shared read/reply receipts in `SocialInboxState`, keyed by Page,
platform and conversation. It stores the last read message ID and last confirmed
reply summary, not a full conversation archive. Migration
`202610230001_social_inbox_state` adds this table only; it was tested in an
isolated database, applied to the configured database, and recorded as applied.
Opening a conversation acknowledges only the latest message actually loaded;
a newer arrival detected before acknowledgement remains unread. Facebook also
receives a best-effort `mark_seen` sender action. Live checking showed Meta may
accept this action while keeping `unread_count` unchanged, so that field alone
cannot represent reading in this inbox. Saved receipts survive refreshes and are
shared between administrators. Confirmed replies override only known pre-send
snapshots while Meta catches up; a new message ID is not hidden by an old reply.
Send success is preserved if receipt storage subsequently fails, preventing an
unnecessary duplicate-send retry.

Live UI verification: opening an unread store conversation saved its read
receipt in the database and cleared its badge. A full browser reload retained
the read state and the selected store Page. No test reply text was sent to a
customer. Thirty focused tests cover receipt persistence, stale summaries,
new customer arrivals, authorization, and preserving send success on a storage
failure; TypeScript and targeted ESLint checks passed.

Message display supports inline Meta-hosted images/stickers, including both the
Messenger `sticker` field and `image_data.render_as_sticker` attachments. A
sticker is deduplicated and labelled in Arabic; failed previews retain an open
link. Media URLs use HTTPS, previews are limited to Meta CDN hosts, and the CSP
allows those image hosts. These signed CDN URLs render directly in the browser
without server image proxying or optimization.

Facebook's comment-origin chat notifications render as source-labelled notices
with a separate HTTPS Facebook comment link. They are not attributed to the
customer as ordinary DMs and cannot open the standard reply window. A prefilled
comment at or before that notification's timestamp also cannot open it; a later
real inbound message can. No private-reply or seven-day messaging extension was
added. The two reported live examples were visually verified; 35 focused tests
and TypeScript/ESLint checks passed.

Additional Facebook Login permissions: `pages_messaging`, `pages_manage_metadata`,
`pages_read_user_content`, `pages_manage_engagement`, `instagram_manage_messages`,
`instagram_manage_comments`. Standard Access/development mode does not prove
real-customer messaging will work; advanced access and any business verification
required by Meta must be completed and tested with authorized accounts.

Replies are manual text replies, max 1000 characters. Direct-message replies
re-read the recent inbound history on the server and require an open 24-hour
window. No paid messaging extension, ads, bulk message, AI provider, or
HUMAN_AGENT exception is invoked. Public comment replies are separate from DMs.
Stateless, short-lived resource handles bind every conversation/post/comment to
its Page, platform, administrator and type. Tokens stay on the server.

Coverage is limited to what Graph makes available. Old inactive Instagram request
threads and unpublished ad media may be unavailable. The comments view lists
Page posts and Instagram media, not every advertising placement. No production
reply was sent as part of verification.

Before live testing, install the following **together** in this store's environment
and deployment, keeping the app secret out of recordings and chat:
```
META_APP_ID=1659118405129311
META_APP_SECRET=<secret from this same app>
META_LOGIN_CONFIG_ID=2165961407639540
META_OAUTH_REDIRECT=https://store.al-shafaq03.com/api/meta/oauth/callback
```

Local setup: Meta accepted an app-authenticated read using the existing
`WHATSAPP_APP_SECRET` for app `1659118405129311`; the old `META_APP_SECRET`
was rejected for that app. The verified secret, correct app ID and configuration
ID were installed together in ignored `.env.local`, preserving `.env`.
Local redirect is `http://localhost:3000/api/meta/oauth/callback`. The dashboard's
validation tooltip says HTTP localhost redirects are automatically allowed in
Development mode and do not need to be added to Valid OAuth Redirect URIs.
Successful local login still needs a fresh end-to-end check.
Production environment variables and deployment have not been changed.

Local OAuth reached Facebook but returned "Can't load URL". Runtime diagnostics
confirmed the correct app ID, configuration ID and local redirect. Do **not** add
`localhost` to App Domains: the current dashboard rejects it for lacking a public
suffix. The owner restored `store.al-shafaq03.com`; an app-authenticated read
confirmed that production domain remained saved. The app's Website URL is unset.

The separate URI checker previously reported the local callback as invalid;
that result alone does not establish whether a Development-mode localhost
login can complete. The actual allowlist showed a validation error. Its tooltip
explicitly says not to add HTTP localhost in Development mode. Latest inspection
also showed a malformed production entry without `https://`, alongside the
correct HTTPS entry. The owner removed both invalid entries and entered the
production HTTPS URI alone. This time the dashboard displayed "Changes saved",
and a completed reload confirmed the correct HTTPS URI persisted. The actual
blue Save Changes button is at the very bottom-left, below the Messenger Page
table; the URI checker does not save.

A fresh login from the local server, with the correct app ID and configuration
ID, still failed before consent with "URL Blocked: redirect URI is not
whitelisted" for `http://localhost:3000/api/meta/oauth/callback`. Thus the
dashboard's localhost tooltip did not establish a working localhost flow for
this app. Do not re-add malformed/local entries or weaken HTTPS/strict settings.
The owner subsequently reported that switching the app from Published to
Development resolved the localhost error. A successful callback was then
verified on `http://localhost:3000/ar/admin/marketing?meta=connected`.
No temporary public tunnel was opened and no production deployment was changed.
OAuth state expires after ten minutes.

Live read-only verification on 2026-10-23:
- Meta `debug_token` confirms a valid token for app `1659118405129311`.
- `/me/permissions` confirms every required publishing, ads and inbox permission
  is granted. Discovery saved eight Pages and fifteen ad accounts.
- Selected Page is `102993405935300` (الشعاع الذهبي); reading a sample Page post
  and a Messenger conversation both succeeds with that Page's token.
- A fresh Page read does not return `instagram_business_account` for the store
  Page. Instagram integration for `golden_ray99` is still unverified/unavailable.
- The owner selected R51 (`act_1386328595534463`); a fresh read confirms it is
  accessible, active, and denominated in USD.
- No publishing, message/comment reply, campaign mutation or spend import was
  performed during verification. Other accessible accounts are not proof they
  belong to this store. Manual selection/import scoping remains necessary.

### Audio and video attachments

Voice notes and videos render with native controls inside the conversation.
Detection uses MIME type, Meta media metadata and filename fallbacks; Messenger
`audioclip-*.mp4` files remain audio even if Meta reports `video/mp4`. A live
GET-only check of the reported conversation confirmed its voice clips arrive as
`audio/mpeg` with an MP4 filename and `file_url`. Audio/video previews are limited
to HTTPS Meta CDN hosts, explicitly allowed by CSP `media-src`. They use no
autoplay and `preload="none"`; starting one pauses other players in this inbox.
An original-file link remains available, including when playback fails; users
can refresh the conversation to obtain a fresh Meta attachment URL. Conversation
previews use “رسالة صوتية” or “فيديو” rather than technical filenames.

## Inbox reply tools (2026-10-23)

- The inbox uses a full-width, viewport-height workspace with compact conversation
  rows, independent scrolling, a fixed reply composer, and an optional tools panel.
  Small screens switch between the list, conversation and tools.
- Editable quick replies use `/shortcut` searches and placeholders for customer
  name, product, price, shipping, availability and link. They populate a draft and
  require manual sending. Missing product values block insertion. Custom replies
  are saved per administrator in this browser's local storage (not across devices).
- Greeting, welcome and booking-information buttons are also available directly
  above the composer, without opening the product panel or selecting a product.
  Saved templates are grouped into general and product-dependent replies based
  on their actual placeholders. Unknown placeholders produce an editing hint,
  not a misleading request to select a product. Successful insertion closes the
  tools panel and reveals/focuses the draft; sending remains a separate action.
- The editor and composer share one browser-backed reply library, including saved
  titles and bodies, additions, deletions and automatic content-based grouping.
  Renaming the booking reply (for example to “تثبيت الطلب”) updates both locations
  immediately. The editor offers “رد عام جديد” and “رد منتج جديد”, insertion
  buttons for supported placeholders, and a live explanation of its resulting
  classification. Existing saved replies are retained; no fixed composer labels
  override the administrator's edits.
- The product picker is administrator-only, excludes archived/internal products,
  and returns at most twenty matches. Availability uses the same consumed statuses
  and active home reservations as the storefront, fetched in two batched queries.
  Prices are stored in thousands of IQD and formatted accordingly. Images are
  previewed in the picker; their links can be inserted into the text draft.
- `SOCIAL_INBOX_STOREFRONT_URL` overrides `NEXT_PUBLIC_SERVER_URL` for customer-facing
  product links. It must be a public HTTPS origin. Local development is configured
  to use `https://store.al-shafaq03.com`, so localhost is never sent to customers.
- Comments display the complete source post and the target comment. A Messenger
  comment-origin notice can also load its original comment/post from server-read
  Meta history. Some notices omit the comment's `object`; the matching GraphQL
  reference supplies the post ID, qualified with the selected Page ID. Post author
  must match the Page. Live GET-only validation retrieved both source texts for
  the existing sample conversation; unavailable/deleted content retains a link.
- “Send and open next” advances only after Meta confirms sending. Conversations
  use oldest waiting customer within the 24-hour reply window among loaded search matches. Comments use loaded
  customer comments not handled in the current post session; this is not a claim
  that those comments have no older replies. Normal send keeps the current target.
  A failed send retains the draft and selection. No live replies were sent in QA.

### Inbox image/video attachments (2026-10-24)

- A paperclip in private conversations selects one JPG/PNG/GIF image (up to
  8 MiB) or MP4 video (up to 25 MiB). Show a local preview and removal control
  before uploading. Upload begins only on Send, with progress; drafts retain the
  file on failure. Text remains a separate draft when sending an attachment,
  avoiding partial success and duplicate text if a second API operation fails.
- `inboxMediaUploader` uses the existing UploadThing storage with fresh admin
  authorization and a Page/platform/conversation-scoped handle. Verify upload
  metadata and one-file count before issuing URLs. Completed uploads receive a
  signed, expiring capability scoped to the administrator and conversation.
  Sending accepts that capability, never arbitrary client media URLs.
- Recheck current Page access and the real inbound 24-hour window before sending
  `message.attachment` with type `image` or `video` and its public storage URL.
  Tokens stay on the server. No caption/text is included in this API write.
- Media completion uses the existing sent/read receipt behavior; a receipt DB
  failure after Meta confirms is reported as success with a follow-up warning.
  Confirmed media renders inline and the sidebar shows an image/video label.
- Blob video previews and hosted UploadThing videos are allowed by media CSP.
  Files remain in the configured UploadThing storage, like other project media;
  removing an unuploaded preview revokes its browser object URL. Failed sends
  retain a completed upload for a manual retry without re-uploading.
- Validation: 55 focused tests cover file boundaries, capability scope/tampering,
  authorization, API attachment payloads, expired windows and post-send receipt
  failure. Isolated headless UI QA checks image/video selection and previews,
  upload failure/retry, retained text, normal sending and responsive layout using
  mocked uploads/Meta only. No real customer media was sent in QA.

### Inbox layout (2026-10-24)

- One compact toolbar contains messages/comments and a Page/platform settings
  popover. Search, status filter with counts, refresh and refresh preferences now
  live in the conversation sidebar; explanatory text is in its options popover.
- The workspace fits the viewport below the admin header without the former
  600px minimum. Messages and the sidebar scroll independently. Smaller RTL
  message bubbles distinguish inbound and sent messages, including dark mode.
- The composer shows three general replies, with additional replies in a menu.
  Product tools remain available in the header; send-next is in the send menu.
  Ctrl/Cmd+Enter sends (IME composition excluded). Reply-window expiry is in an
  accessible status popover; blocked-window explanations remain visible.
- QA renders the real client components with mocked actions in an isolated
  headless browser, never the user's browser session. Desktop/mobile geometry
  and filters, quick replies, settings, comment replies and sending are checked
  with synthetic data only. No live messages or account changes are made.

### Inbox send latency (2026-10-24)

- Normal sending releases the composer after the send action returns, instead of
  waiting for sequential detail reload, read acknowledgement and list reload.
  Meta confirmation and persisted follow-up receipt are still awaited; the server
  still re-reads the recipient/window before sending. No speculative success or
  automatic retry of a write is introduced.
- Confirmed messages update the conversation, local unread state and filters
  immediately. Confirmed comment replies are inserted locally and retained during
  stale Meta reads for the current workspace. Manual/optional 30-second refresh
  continues to fetch new inbound activity.
- Ignore list refresh responses started before sending and prevent same-frame
  double clicks. “Send and open next” only loads the newly selected destination.
- Validation uses mocked send/window/receipt regressions, TypeScript and ESLint.
  No live customer message was sent; actual end-to-end timing still depends on
  Meta and the database and has not been measured after this change.

## Troubleshooting: "Invalid Scopes" on connect

Meta returns `Invalid Scopes: <names>` for any permission whose **product/use
case has not been added to the app** — it is a dashboard-config issue, not an
app-review one (review-gated permissions still appear in the dialog; invalid
ones are rejected outright). Observed: `pages_show_list, pages_read_engagement,
business_management, ads_management, ads_read` are accepted on a fresh Business
app, while `pages_manage_posts, instagram_basic, instagram_content_publish` are
rejected until their products are added.

Because the scope list is now env-driven (`META_SCOPES`), iterate without code
changes:
1. Connect now with the minimal set (ads + page reading) to prove the OAuth pipe
   and select the Page + ad account.
2. In the Meta app dashboard, add the products/use cases that own the missing
   permissions:
   - **Page posting** (`pages_manage_posts`): add the Facebook Login use case
     that manages Page content, or add the permission under a customized use case.
   - **Instagram** (`instagram_basic` + `instagram_content_publish`): add the
     Instagram product. This integration uses Facebook Login and the
     `instagram_basic` / `instagram_content_publish` permissions. The
     `instagram_business_*` family belongs to the separate Instagram Login
     integration; do not substitute those names in this flow. A linked
     Business/Creator Instagram account is required here.
3. Expand `META_SCOPES` to include the posting/IG scopes once their products are
   added, and reconnect.

## What I can and cannot do
- **Can:** build the full flow to spec, type-checked and building, matching Meta's documented API.
- **Still requires owner/Meta action:** App Review, business verification, and
  confirmation of the intended assets. Read access has been tested with the
  authorized local connection; production configuration and write operations
  remain unverified.
# تجهيز الطلب من المحادثة دون ذكاء اصطناعي

تحديث 2026-10-24 للإرسال: تظهر الرسالة فوراً بحالة انتظار/إرسال، ويستمر تحرير
المسودة والتنقل داخل الصندوق. تحفظ الواجهة طابوراً منفصلاً لكل محادثة عبر تبديل
الصفحات والمنصات. علامة واحدة تعني قبول Meta للإرسال؛ علامتان تعنيان إشعار تسليم،
واللون الأزرق يعني إشعار قراءة من الزبون. حالة قراءة المشرف للمحادثة مستقلة عنها.
أُضيفت جداول الإيصالات بترحيل `202610240002_social_inbox_delivery` ومسار
`/api/meta/webhook` الموقّع. استقبال الإيصالات الفعلية يحتاج نشر المسار وتفعيل
الاشتراك في Meta؛ الفحص الحالي وجد اشتراك واتساب فقط. خطوات التفعيل والتحقق
موثقة في [تقرير الإرسال والإيصالات](audit-2026-10-24/inbox-optimistic-delivery.md).

زر «تجهيز طلب» في رأس المحادثة الخاصة يقرأ آخر 50 رسالة من Meta عند فتحه،
ويستخرج الهاتف والمحافظة والحقول المسمّاة الواضحة. يقترح أيضاً العنوان عند وجود كلمات مكان مثل «حي» و«قرب»، مع تنبيه للمراجعة. الاسم ثابت «زبون» على
الخادم والواجهة. تعدد الهواتف أو المحافظات يترك الاختيار للمشغّل. العنوان غير
الواضح يُستكمل يدوياً. يمكن تحديد المنتج من رابط landing/product على نطاق
المتجر المضبوط، أو اختيار أدوات الرد، أو البحث داخل المسودة. الكمية الافتراضية
1، وتسعير العروض والألوان مأخوذ من المنتج. التجهيز وحده لا يحجز مخزوناً.

الاعتماد يستدعي `submitQuickOrder` نفسه الذي تستدعيه صفحة الهبوط: تحقق
`insertOrderSchema`، تسعير على الخادم، دمج طلب home غير مؤرشف خلال 18 ساعة،
عدم جمع كمية المنتج المكرر، حماية عنوان مختلف، توصيل واحد، وحجز المخزون داخل
المعاملة. الحجز لا ينقل الطلب إلى الشحن؛ الطلب الجديد في home. تُرسل رسالة
تأكيد واتساب بالطريقة نفسها بعد الحفظ، دون تكرار للمنتج المكرر أو إعادة المحاولة.

قفل PostgreSQL حسب الهاتف يسبق فحص التكرار. جدول `SocialInboxOrder` يحتفظ
بمعرّف اعتماد مرتبط بالصفحة والمنصة والمحادثة وبيانات المسودة والطلب داخل المعاملة
نفسها؛ تكرار الطلب الشبكي يعيد الطلب المحفوظ حتى بعد تغيير حالته، وتغيير بيانات
اعتماد محفوظ يُرفض. الحماية لا تعتمد على تعطيل الزر وحده. جدول الاعتمادات يحتاج
ترحيل `202610240001_social_inbox_orders` وتوليد Prisma Client. بعد توليد العميل
يجب إعادة تشغيل أي خادم تطوير قديم يحتفظ بنسخة Prisma مخبأة.

التحقق: اختبارات تحليل وصلاحيات، `scripts/test-social-orders.cjs` بقاعدة PostgreSQL
في الذاكرة وإشعارات وهمية، وفحص واجهة منفصل ببيانات صناعية. لا تنشئ الاختبارات
طلبات حقيقية ولا ترسل رسائل للزبائن.

## معاينة مصدر التعليق داخل المحادثة

عند فتح محادثة فيها إشعار «محادثة بدأت من تعليق»، تُجلب بيانات المصدر تلقائياً
وتظهر تفاصيل المنشور وصورته وتعليق الزبون مباشرة داخل عنصر الإشعار نفسه، بلا
زر لعرض التفاصيل أو نافذة منفصلة. اسم المنتج يُربط بعلاقة SocialPost.productId
الصريحة أو رابط landing/product من نطاق المتجر داخل النص؛ لا يُخمن من تشابه
الأسماء. يمكن اختيار المنتج المرتبط لتجهيز الحجز من المحادثة نفسها. كل عنصر
يرسل messageId الخاص به ويُطابق مع تاريخ المحادثة على الخادم، حتى لا يُعرض مصدر
إشعار آخر إذا تكرر إشعار بدء محادثة من تعليق.

مصدر المعرّفات هو إشعار Meta المقروء على الخادم: object أو مرجع GraphQL المطابق
للتعليق أو post_id وstory_fbid الخاصان بالصفحة المختارة. لا تُقبل تلميحات صفحة
أخرى، ويجب أن يؤكد Graph أن مؤلف المنشور هو الصفحة المصرح بها قبل عرضه أو
مطابقة منتجه. الصورة المصغرة من full_picture وتُعرض ضمن نطاقات الوسائط المسموحة.
حذف التعليق لا يمنع محاولة جلب منشوره؛ انتهاء التوكن يبقى خطأ اتصال واضحاً.
المحتوى المحذوف أو المحجوب عن التطبيق قد يتعذر عرضه، ويظهر توضيح بدلاً من تخمين.

تصحيح روابط pfbid (2026-10-24): قد يحتوي رابط Facebook العام على معرّف ملف
مختلف عن Page Graph ID. لذلك يُحل pfbid باستخدام معرّف الصفحة المصرح بها، ثم
يُتحقق من from.id في استجابة المنشور. لا يُرفض الرابط لمجرد اختلاف معرّف الملف
في الرابط العام. تحقق قراءة حيّ للمثال comment_id=1308368471352384 أعاد المنشور
102993405935300_1092074520345892 مع النص والصورة والتعليق. لم تُرسل أي رسائل.
