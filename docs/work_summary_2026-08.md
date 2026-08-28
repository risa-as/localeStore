# Work Summary — Inventory, Profit, WhatsApp & Meta Marketing

Branch: `fix/batches-stock-deduction` · 60 commits ahead of `master`
Span: 2026-07-21 → 2026-08-28 · 55 files changed (+12,286 / −713)

Everything below is committed **locally only**. Nothing has been pushed to
GitHub; deployment to Vercel is done by the owner.

---

## 1. Inventory & stock deduction

**Problem:** a product created with a quantity never appeared on
`/admin/batches`, so its stock had no cost basis and profit was wrong.

- `createProduct` now creates the **opening batch inside the same transaction**
  as the product, so quantity and batch can never diverge.
- Unified the status sets in `lib/constants/order-statuses.ts`:
  - `STOCK_CONSUMED_STATUSES` — **includes `pending`**, because the goods have
    physically left the warehouse.
  - `REVENUE_STATUSES` — only orders that actually count as revenue.
- The FEFO/FIFO cost engine (`lib/fefo.ts`, `lib/fefo-cogs.ts`) reads from the
  unified sets, with `lib/fefo.test.ts` covering the deduction math.
- Backfill scripts: `scripts/seed-opening-batches.ts` and
  `scripts/seed-fixed-opening-batches.ts` (the latter also corrects known stock
  counts). 2 + 16 products were seeded against production.

## 2. Profit dashboard (`/admin/profit`)

- Rebuilt to match the `design_handoff_profit_analytics` handoff while keeping
  the existing admin navigation.
- Expenses are prefilled from the database but remain editable.
- All ad columns are always visible (no longer conditionally hidden).
- **Date fix:** the default "this month" range no longer starts a day early.
- Chart: hover readout showing the value at the hovered point; RTL axis labels
  corrected.
- **Mismatch warning banner:** flags orders whose total does not equal the sum of
  their line items — the root cause of the wrong unit prices seen on imported
  orders (the Excel import wrote an order total that included shipping).
  Collapsible, and closed by default.
- Read-only diagnostics: `scripts/debug-profit-discrepancy.ts`,
  `scripts/debug-order-total-mismatch.ts`.

## 3. Orders page

- Summary cards: order count, total value, delivery cost, and value excluding
  shipping — all **scoped to the active filter**.
- Shipping figures reconcile with the courier: the **courier's actual fee** is
  subtracted, not the amount charged to the customer.

## 4. WhatsApp

- Fixed the «رسالة غير مدعومة» problem by handling more inbound message types.
- Added **image sending** from the admin chat.
- Verified the free-message policy change (effective 1 Oct 2026).
- Composer effects: animated upload progress (ring spinner + counter) and
  pop-in media previews.
- Multi-tenant helper `lib/whatsapp-tenant.ts` (two deployments share one
  number), plus `scripts/cleanup-foreign-wa-conversations.ts` and
  `scripts/simulate-wa-webhook.ts`.

## 5. Meta integration (Facebook + Instagram)

The largest piece, built in phases. All tokens stay server-side; all config is in
`.env` (`META_APP_ID`, `META_APP_SECRET`, `META_SCOPES`, `META_ADS_BASE_URL`).

### 5.1 Connection (`الاتصال` tab)

- OAuth with an **HMAC-signed state** parameter; `auth_type=rerequest` forces
  Facebook to re-prompt for newly added scopes.
- `META_SCOPES` is env-configurable (Meta rejected the older Instagram scope
  names on this app).
- Page / ad-account selection, a token-expiry countdown, and a **permissions
  diagnostic** that names any missing scope in plain Arabic.

### 5.2 Publishing (`النشر` tab)

- Publish to Facebook and Instagram — images and video — through a single API
  surface in `lib/meta/publish.ts` (IG video uses the container → status →
  publish flow).
- Media uploaded via UploadThing so Meta can fetch public URLs.

### 5.3 Launching ads (`الإعلانات` tab)

Campaign → ad set → creative → ad, all created **PAUSED** for review.

Settings discovered empirically — each one fixed a real API rejection:

| Setting | Why |
| --- | --- |
| `is_adset_budget_sharing_enabled: false` | required with ad-set budgets (subcode 4834011) |
| `bid_strategy: LOWEST_COST_WITHOUT_CAP` | avoids requiring a bid amount (subcode 2490487) |
| `targeting_automation.advantage_audience: 0` | must be set explicitly; keeps the chosen age/gender (subcode 1870227) |
| `promoted_object` + `destination_type: WEBSITE` | Sales needs a pixel + purchase event, else the ad set stays under-configured |
| App in **Live** mode | development mode blocked video publishing (subcode 1885183) |
| Payment method on the account | subcode 1359188 |

Also: Sales/Engagement objective toggle, pixel picker, all placements, a headline
field, age default 24–60, and budgets shown in the ad account's **real currency**
(fetched live) instead of a guess.

### 5.4 The "existing post" two-step flow

The important correction of the session. An **organic** post cannot carry an
added button/link — Meta accepts the field on `object_story_id` but ignores it.
The owner's real workflow works because:

1. **«إنشاء إعلان بزر ورابط»** builds a creative from `object_story_spec`; Meta
   then produces an **ad post** whose id is `effective_object_story_id`, and that
   post *does* carry the CTA and the landing link.
2. **«استخدام منشور حالي»** pointed at *that* post inherits the button, link and
   headline.

Confirmed by comparing the owner's two campaigns — both ads referenced the same
`object_story_id` (`597965583392444_122192666870791084`).

Implemented as:

- `launchVideoAd` captures `effective_object_story_id` after ad creation, and can
  reuse a passed `existingStoryId`.
- The ad selector lists the page's **live video posts** (`published_posts` +
  `ads_posts`), each tagged with its real CTA status read from Facebook — 🔗
  «يحمل زراً ورابطاً» vs «منشور عضوي».
- Picking a 🔗 post auto-reuses it, so a Sales ad is allowed; picking an organic
  post blocks Sales with a clear message.

**Schema consequence:** a live check found **8 of 12** page video posts carry a
button, but only **5 of 12** map to a `SocialPost` — most reusable ad posts were
created in Ads Manager, not by the system. So `MetaAdLaunch.postId` became
**nullable**, and a new `pagePostStoryId` records what was promoted. Any page ad
post carrying a button is now reusable, system-published or not.

CTA note: **`BOOK_TRAVEL` renders «حجز الآن»** correctly; `BOOK_NOW` displayed
«غير معروف» for website video ads, so `BOOK_TRAVEL` is the default.

### 5.5 Performance tab (`الأداء`)

Reports across **all 13 ad accounts** (`lib/meta/insights.ts`).

- Metrics per account and per ad: spend, **cost per purchase**
  (`omni_purchase`) for sales ads and **cost per message**
  (`onsite_conversion.messaging_conversation_started_7d`) for engagement ads,
  plus impressions and reach.
- **Filters:** «كل الإعلانات» (default) and «النشطة الآن»; date presets
  (today → maximum) plus a custom from/to range.
- `activeOnly` is applied *only* to the account predicate and the `/ads` status
  filter — never to account-level insights, which are historical and have no
  status dimension.
- Cost renders as **«—» when the result count is 0** (`null`), never a misleading
  `0.00`.
- Each account is fetched in its own `try/catch`, so one failing account degrades
  to a single error row instead of collapsing the tab.
- Fetched **client-side on tab open**, so the other tabs don't pay for ~26 Graph
  calls.
- **Layout:** accounts in a grid (1 / 2 / 3 columns) with equal height per row;
  ads as cards inside each account (2 per row) showing status pill, objective,
  budget, spend, cost per result, results and impressions.
- Sorting: alphabetical and numeric-aware (A2 before A10), with **Arabic-named
  accounts grouped last**.
- **Per-ad on/off button.** «تشغيل» activates the whole chain
  (campaign → ad set → ad), because system ads are created with the campaign
  paused and flipping only the ad would never deliver; «إيقاف» pauses just the ad
  so sibling ads are untouched. Meta returns a transient `IN_PROCESS` right after
  an edit, which is coerced to a clean state, while genuine problems (rejected /
  in review) are surfaced.
- **Promotion budget per ad:** read from the ad set, falling back to the campaign
  for CBO campaigns, converted from minor units. Verified against the budgets
  encoded in the ad names (e.g. «… 30» = $30/day).

---

## 6. Schema changes (`prisma/schema.prisma`)

New models: `MetaConnection`, `SocialPost` (with `videoUrls`, `fbVideoId`,
`igContainerId`) and `MetaAdLaunch`.

`MetaAdLaunch` gained, over the session:

| Column | Purpose |
| --- | --- |
| `effectiveStoryId` | the ad post carrying the button/link, for reuse |
| `headline` | ad headline, used to label reusable posts |
| `postId` → **nullable** | a promoted page post may have no `SocialPost` |
| `pagePostStoryId` | what was promoted when `postId` is null |

## 7. Pending actions for the owner

1. **`npx prisma db push`** — one push covers every column above. **The marketing
   page throws until this is run**, because the code selects columns that do not
   exist in the database yet. (The owner runs it: the local `.env` points at the
   production Neon database.)
2. `npx tsx scripts/seed-opening-batches.ts` on production, if not already done.
3. Deploy to Vercel — nothing is pushed to GitHub.

## 8. Working notes

- **Product prices are stored in thousands IQD** (`formatCurrency` multiplies by
  1000); **ad budgets are whole currency units** and must not be scaled that way.
- Currency minor-unit offsets: IQD 1000, USD 100 (`currencyOffset`).
- Meta errors only become actionable once `error_user_msg`, `blame_field_specs`
  and `error_subcode` are surfaced — `lib/meta/graph.ts` joins all of them into
  the thrown message. That is what made the ad-launch fixes tractable.
- Verification pattern used throughout: probe the live API (throwaway creatives,
  field read-backs, ad previews) **before** changing code. Several plausible
  assumptions about Meta's behaviour turned out to be wrong, and only the
  empirical checks settled them.
- `.env` is gitignored and holds production secrets; it is never committed.

## 9. Key files

```text
lib/meta/            config.ts  graph.ts  publish.ts  ads.ts  insights.ts
lib/actions/         meta.actions.ts  social.actions.ts  insights.actions.ts
app/[locale]/admin/marketing/
                     page.tsx  marketing-client.tsx
                     marketing-publish.tsx  marketing-ads.tsx  marketing-insights.tsx
app/api/meta/oauth/  route.ts  callback/route.ts
components/admin/profit/
                     profit-dashboard.tsx  profit-dashboard.css
lib/                 inventory.ts  constants/order-statuses.ts  whatsapp-tenant.ts
docs/                meta_marketing_integration.md  meta_ad_snapshot_current.json
```
