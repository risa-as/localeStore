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
- [ ] `lib/meta/config.ts` — env reader (`getMetaConfig`), Graph version, scope list, redirect URL. Mirrors `getWaConfig`.
- [ ] `lib/meta/graph.ts` — thin Graph API GET/POST helpers with typed errors (raw `fetch`, NOT the SDK — the SDK stays for CAPI only; it has TS friction here).
- [ ] Prisma: `MetaConnection` — add to `schema.prisma`. Schema is already ahead of `prisma/migrations`, so this is applied with **`npx prisma db push`, run by the store owner** against their own DB (this machine's `.env` points at production — never push from here).
- [ ] `/admin/marketing` route + nav entry (admin-only) with a "not configured" state.

### Phase 1 — Connect accounts (OAuth)
- [ ] `GET /api/meta/oauth` — build the Facebook login dialog URL with a signed `state`.
- [ ] `GET /api/meta/oauth/callback` — exchange code → long-lived user token → list Pages, IG accounts, ad accounts → store.
- [ ] Server actions: `getMetaConnection`, `selectPage`, `selectAdAccount`, `disconnectMeta`.
- [ ] Connections panel UI: connect/disconnect, show connected assets + token expiry.

### Phase 2 — Publish posts
- [ ] Prisma: `SocialPost` (platform, productId?, caption, media, status, fbPostId, igPostId, error).
- [ ] `publishToFacebook` — Page photo/feed post via page token.
- [ ] `publishToInstagram` — 2-step media container → publish.
- [ ] Reuse UploadThing for public image URLs (both APIs require a fetchable URL).
- [ ] Composer UI: pick product (prefill images + caption), choose platform(s), publish; posts list.

### Phase 3 — Launch ads from a post
- [ ] Prisma: `MetaAdLaunch` (postId, adAccountId, campaign/adset/ad/creative ids, budget, status).
- [ ] `launchAd` — Campaign → Ad Set (geo=Iraq, budget, dates) → Creative → Ad, created **PAUSED** for safety.
  - FB Page post: creative via `object_story_id` = `{pageId}_{postId}`.
  - IG post: **different** creative path (`instagram_actor_id` / source media), not `object_story_id` — handle separately.
- [ ] Launch dialog UI: pick ad account, objective, budget, dates, basic targeting; then activate.
- [ ] Do **NOT** write the ad budget into `AdCampaign`. That table is manual *actual spend* and `getExpenseStatsForPeriod` pro-rates it into real profit; a budget is planned, not spent. Real spend later comes from the Insights API (`/act_{id}/insights`, `spend`), reconciled after the fact — a separate feature.

### Cross-cutting
- [ ] OAuth `state` CSRF protection; tokens never sent to the client.
- [ ] Token-expiry surfacing + guidance to reconnect.
- [ ] English/Arabic strings for the new UI.

## Env vars to add (later, once app is created in Meta)
```
META_APP_ID=
META_APP_SECRET=
META_OAUTH_REDIRECT=https://<domain>/api/meta/oauth/callback
META_GRAPH_VERSION=v25.0   # optional; defaults in code
```

## What I can and cannot do
- **Can:** build the full flow to spec, type-checked and building, matching Meta's documented API.
- **Cannot:** run Meta App Review, verify the business, or test against the live Graph API (no app credentials here). Live testing is on the owner after deploy, in Development mode first.
