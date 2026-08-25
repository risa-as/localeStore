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
META_SCOPES=...          # optional; comma-separated. Overrides the default list.
META_OAUTH_REDIRECT=https://<domain>/api/meta/oauth/callback
META_GRAPH_VERSION=v25.0   # optional; defaults in code
```

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
     Instagram product. Note Meta is migrating these names to
     `instagram_business_basic` / `instagram_business_content_publish`; if the
     legacy names stay invalid, switch `META_SCOPES` to the new names (the
     publish flow in `lib/meta/publish.ts` is the IG-Graph-via-FB-Login flow and
     needs a Business/Creator IG account linked to the Page).
3. Expand `META_SCOPES` to include the posting/IG scopes once their products are
   added, and reconnect.

## What I can and cannot do
- **Can:** build the full flow to spec, type-checked and building, matching Meta's documented API.
- **Cannot:** run Meta App Review, verify the business, or test against the live Graph API (no app credentials here). Live testing is on the owner after deploy, in Development mode first.
