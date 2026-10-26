# Verification of `report-ar.md` — source check

Every claim below was checked against the code in the working tree, not against the
audit's own evidence files. Verdicts are **Confirmed**, **Partly wrong**, or
**Not verified** (with the reason it could not be settled here).

The audit's database counts (6,894 / 4,955 / 61 / 1,485 …) are **not verified**: this
machine's `DATABASE_URL` and the one the audit queried are separate Neon databases, so
neither a match nor a mismatch would prove anything. Treat those rows as the audit's
own snapshot.

---

## 0. A regression in the item-delete feature shipped earlier this session

F3 is not only a pre-existing problem — it now has a second trigger that I added.

`deriveTotals` in `app/[locale]/admin/orders/update-order-form.tsx` computes
`Number(item.price) * qty`. It does not add `shippingPrice` and does not apply the
two-piece offer. Deleting a product therefore rewrites `totalPrice` to an items-only
figure and silently drops the 4–5k shipping component. This was already true for
quantity edits before the change; the delete button makes it fire in a second place.

The fix is a server-side recompute (`computeItemsPriceTotal` + max item shipping,
mirroring `lib/actions/order.actions.ts:466-478`) rather than a client-side multiply.
That is real scope and has not been applied.

---

## 1. Most severe finding — understated in the report

The report places this in a table row under "وظائف ناقصة". It is larger than anything
in the F-series.

**`updateUser` writes `role` with no authentication check whatsoever.**

```ts
// lib/actions/user.actions.ts:248
export async function updateUser(user: z.infer<typeof updateUserSchema>) {
  await prisma.user.update({ where: { id: user.id }, data: { name: user.name, role: user.role } });
```

`lib/actions/user.actions.ts` has 11 exported actions, 3 `auth()` calls and **0** role
checks. `lib/actions/product.actions.ts` (6 exports, incl. `deleteProduct`,
`createProduct`, `updateProduct`) and `lib/actions/expense.actions.ts` (9 exports) have
**0** of either. Next.js server actions are POST endpoints; page-level guards in
`auth.config.ts` do not protect them. **Verdict: Confirmed.**

---

## 2. Money — F1 to F8

| # | Claim | Verdict |
|---|---|---|
| F1 | Date boundaries drop expenses | **Confirmed** |
| F2 | "صافي الربح" in the overview is not net | **Confirmed** |
| F3 | Order edit can drop shipping and void the offer | **Confirmed** |
| F4 | Batch cost is not fixed historically | **Confirmed** |
| F5 | Return/damage/settlement costs incomplete | **Confirmed (structural)** |
| F6 | One imported day voids a whole manual campaign | **Confirmed** |
| F7 | Product profit allocation and alerts | **Confirmed (all three parts)** |
| F8 | Currency units correct but unprotected | **Confirmed** |

### F1 — Confirmed, and worse than described

`Expense.fromDate/toDate`, `AdCampaign.*`, `AdSpendDaily.date` are all `@db.Date`
(`prisma/schema.prisma:192-206, 355`) → read back as midnight UTC. The profit page
passes midday UTC (`app/[locale]/admin/profit/page.tsx:33`).

Worked example, single-day expense on 1 Sep with the report period set to 1 Sep:
- `fromDate` (Sep 1 00:00Z) `<= to` (Sep 1 12:00Z) ✓
- `toDate` (Sep 1 00:00Z) `>= from` (Sep 1 12:00Z) ✗ → excluded

Same for imported spend: `date: { gte: from }` drops every `AdSpendDaily` row falling on
the **first day** of the window. Last-day rows survive. It is a systematic off-by-one at
the start of the period, not a random loss.

**Not in the report — `app/[locale]/admin/profit/page.tsx:44-46`:**

```ts
const defaultTo = searchParams.to
    ? parseDate(`${iraqYear}-${iraqMonth}-${iraqDay}`)
    : parseDate(`${iraqYear}-${iraqMonth}-${iraqDay}`);
```

Both branches are identical. `searchParams.to` is parsed nowhere, so the date picker's
end date is inert and the window always ends today. Any historical period is silently
widened to the present.

### F2 — Confirmed

`lib/actions/order.actions.ts:1539` filters `status: { not: "Cancelled" }`. The app's
real statuses are in `lib/constants/order-statuses.ts` — `home`, `pending`, `completed`,
`completedAccountant`, `returned`, `returnReceived`, `failed`, `rescheduled`, … There is
no `Cancelled`, so the filter excludes nothing and returned/failed orders count as
profit. Monthly and daily sales charts sum `totalPrice` over every order with no status
filter at all.

### F3 — Confirmed, with the full divergence

Three code paths produce three different totals for the same basket:

| Path | Formula | 2 × 27k product, 5k shipping, 47k two-piece offer |
|---|---|---|
| Cart display (`lib/actions/cart.actions.ts:12`) | `price × qty + max(shipping)` | 59 |
| Order save (`lib/actions/order.actions.ts:466-478`) | `computeItemsPriceTotal` + `max(shipping)` | 52 |
| Admin edit form | `price × qty` | 54 |

`computeOrderPricing` / `computeItemsPriceTotal` (`lib/pricing.ts`) are used only inside
`order.actions.ts`. The cart never calls them.

### F4 — Confirmed

`sortBatchesFefo` (`lib/fefo.ts:42`) orders batches by `createdAt` only. Nothing
compares a batch's date to the sale's date, so a February sale consumes a March batch
once the cursor reaches it. `buildFefoContexts` (`lib/fefo-cogs.ts`) re-derives the
whole allocation on every call from `order.status IN STOCK_CONSUMED_STATUSES` — no COGS
is persisted — so an older order leaving that set reallocates cost to later orders.

Partial mitigation the report does not mention: `fefoStart` freezes sales that predate a
product's earliest batch to their snapshot cost. Inside the FEFO era the claim stands in
full.

### F5 — Confirmed as structural

`lib/constants/order-statuses.ts` documents it outright: consumption is "derived from
current status, never stored", and a return "automatically releases the units back to
their batch … no write is needed". So stock returns to available the moment the status
flips, before the goods physically arrive. There are no schema fields for outbound/return
leg cost, damage, or partial refund (`prisma/schema.prisma`).

### F6 — Confirmed

`lib/actions/expense.actions.ts:280-287`: if any single day inside a manual campaign's
range has an imported row, `_replaced` is set and `continue` drops the campaign's entire
prorated portion. `_partial` is computed but only used for display — it never prorates.
A 10-day 100k manual entry with one 10k imported day yields 10k, exactly as reported.

### F7 — Confirmed, all three parts

1. `lib/actions/order.actions.ts:1835-1859` allocates order net revenue pro-rata by
   `price × qty` — raw, pre-offer prices — so one item's discount is spread across all.
2. The inconsistency alert compares `totalPrice` against `rawItemsTotal + shippingPrice`
   (naive multiply), so every legitimate two-piece-offer order is flagged as mismatched.
   This compounds F3.
3. `components/admin/profit/profit-dashboard.tsx:458-473` sorts by `totalProfit` and
   labels the card `صافي ربح`. `profitAfterAds` exists at line 1140, so the distinction
   is known in the file but not applied to that card.

### F8 — Confirmed

`lib/actions/shipping-settings.actions.ts:17` seeds `baghdadCost: 4000, othersCost: 5000`
while the rest of the profit layer works in thousands. Re-creating settings inflates
delivery cost 1000×. `toIqdAmount` (`lib/pricing.ts`) infers the unit from a `< 1000`
threshold, which is a guess based on magnitude.

---

## 3. Data exposure and permissions

| Claim | Verdict | Evidence |
|---|---|---|
| Admin actions lack in-action authorization | **Confirmed** | counts in §1 |
| `getUserById` returns the full user row | **Confirmed** | `user.actions.ts:92` — bare `findFirst`, returns `password` hash |
| `getOrderById` has no ownership check | **Confirmed** | `order.actions.ts:722` — any order's name/phone/address by id |
| …and leaks the password hash | **Partly wrong** | already fixed: `user: { select: { id, name, email } }` with a comment explaining the removal |
| Deleting a product deletes historical order items | **Confirmed** | `schema.prisma:157` `onDelete: Cascade` |
| Deleting a user deletes their orders | **Confirmed** | `schema.prisma:132` `Order.user … onDelete: Cascade` |
| `getMyCart` can query unbounded | **Confirmed** | `cart.actions.ts:116` — no user and no cookie ⇒ `where: { sessionCartId: undefined }` ⇒ `{}` ⇒ returns another visitor's cart |
| `/api/debug-db` unprotected | **Confirmed** | `app/api/debug-db/route.ts` — no auth, returns schema + masked connection string |
| All completed orders still `isPaid=false` | **Confirmed structurally** | `isPaid: true` is written in exactly one place, `order.actions.ts:1490`, reached only by the Stripe webhook. The COD status flow never touches it |
| Guest checkout blocked by route guards | **Confirmed in code** | `auth.config.ts:9-16` protects `/shipping-address`, `/payment-method`, `/place-order`. Runtime behaviour on the deployed site not tested |

---

## 4. The return/refusal WhatsApp template

The routing table in the report is accurate. Verified call sites: `sendOrderReturned` is
called from exactly two places — `order.actions.ts:1196` (single edit) and `:1306`
(bulk). Nothing else.

- **Sync path does not fire it.** Confirmed — not among the two call sites.
- **Bulk duplicates.** Confirmed: `order.actions.ts:1290-1315` messages every selected
  id with no check of prior status, so re-applying `returned` re-sends.
- **Customer refusal never triggers it.** Confirmed and the most consequential item:
  `lib/delivery/providers/modon.ts:120` maps status `32` — `"رفض الزبون الطلب"` — to
  `failed`, not `returned`. Statuses 31, 39, 41 (cancelled beforehand / never ordered /
  unreachable) also map to `failed`. The actual refusal population never reaches the
  template.
- **Webhook returns success on failure.** Confirmed but **partly overstated**: the
  `return NextResponse.json({ success: true })` after a swallowed catch is deliberate and
  documented — "نرجع 200 دائماً حتى لا تعيد Meta الإرسال بلا نهاية". The real gap is the
  absence of a dead-letter or retry record, not an accidental 200.

Template text, Meta approval status, and the 313/144 failure codes were not checked —
that requires WhatsApp Manager access, which the audit itself reports it could not obtain.

---

## 5. Customer-journey section (items 1–8)

Mostly design judgement rather than verifiable defects; not graded as claims. Two
factual pieces were checked:

- **Unbacked policy promises — Confirmed.** `messages/ar.json:110` promises
  "شحن مجاني للطلبات فوق 100 دولار", `:112` a 30-day money-back guarantee, `:114` PayPal.
  `calcPrice` (`cart.actions.ts:12`) has no free-shipping threshold — shipping is always
  `max(item.shippingPrice)`. The promise has no implementation behind it.
- **Identity mismatch — Confirmed.** `components/shared/product/landing-page.tsx:291`
  renders `Inside Stock`; `:358` renders `AURUM Luxury Store`.

Mobile layout claims (buy button at ~1850px on a 390px viewport, image legibility) are
**not verified** — the browser extension is not connected in this session.

---

## 6. Summary

Of the claims that could be settled from source, the report is accurate. Two are
overstated — the `getOrderById` password-hash leak is already fixed, and the webhook's
always-200 is a documented tradeoff rather than an oversight. One claim it makes in
passing (`updateUser` with no authorization) is more serious than its placement
suggests. One bug it missed (`defaultTo` discarding `searchParams.to`) makes F1 worse.

Nothing in the report was found to be fabricated, and nothing was fixed as part of this
verification.
