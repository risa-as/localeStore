---
description: "Task list for Vercel Cost Drain Fix & Performance Audit Remediation"
---

# Tasks: Vercel Cost Drain Fix & Performance Audit Remediation

**Input**: Design documents from `/specs/001-fix-cost-drain/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓

**Tests**: Not requested — fixes are verified manually per quickstart.md test scenarios.

**Organization**: Tasks grouped by user story to enable independent implementation and verification of each fix.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5 from spec.md)
- Exact file paths included in every task description

---

## Phase 1: Setup (Read Target Files)

**Purpose**: Confirm all 8 target files are on the correct branch and in expected state before making any changes. No code modifications in this phase.

- [x] T001 Confirm active branch is `001-fix-cost-drain` via `git status`, then read all 8 target files: `app/[locale]/thank-you/page.tsx`, `components/shared/facebook-pixel.tsx`, `lib/actions/product.actions.ts`, `app/[locale]/(root)/page.tsx`, `app/[locale]/landing/[slug]/page.tsx`, `components/shared/product/landing-page.tsx`, `middleware.ts`, `next.config.ts`

**Checkpoint**: All 8 files read and understood. Confirm: countdown useEffect at `thank-you/page.tsx:79`, `data` in FbPixel deps at `facebook-pixel.tsx:42`, no `unstable_cache` in `product.actions.ts`, no `revalidate` export in either page.tsx, `unoptimized` prop at `landing-page.tsx:84,140`, no rate limiting in `middleware.ts`.

---

## Phase 2: P1 Critical Fixes — US1 + US2 (Can Run in Parallel)

**Purpose**: Fix the two highest-severity bugs that directly cause the cost drain and UX crash. Both are in different files and fully independent — they can be fixed simultaneously.

**⚠️ CRITICAL**: These are P1 fixes. Complete before any P2/P3 work.

---

### Phase 2A: User Story 2 — Stable Thank-You Page (Priority: P1) 🎯 MVP

**Goal**: Eliminate the infinite `setInterval` recreation that causes CPU storm and repeated CAPI server action calls on every countdown tick.

**Independent Test**: Open DevTools Performance tab, navigate to `/[locale]/thank-you?orderId=test`, wait 10 seconds, stop recording. CPU usage must be flat (< 5%). Memory must not grow. Only 1 active interval visible in browser task manager.

- [x] T002 [US2] Fix countdown useEffect infinite loop in `app/[locale]/thank-you/page.tsx` (lines 79–90): add `const routerRef = useRef(router)` and a sync effect `useEffect(() => { routerRef.current = router; }, [router])`, then rewrite the countdown effect with empty deps `[]` — move the `timeLeft === 0` check inside the setInterval callback using the functional state updater pattern: `setTimeLeft(prev => { if (prev <= 1) { clearInterval(intervalId); routerRef.current.push('/ar'); return 0; } return prev - 1; })` — also add `useRef` to the imports on line 2

**Checkpoint (US2 complete)**: Thank-you page countdown runs 30 seconds with exactly 1 interval. DevTools shows flat CPU. No memory growth. Browser does NOT freeze.

---

### Phase 2B: User Story 1 — Zero Surprise Billing via Image Fix (Priority: P1) 🎯 MVP

**Goal**: Re-enable Vercel's image CDN cache for product images so they are processed once and served from cache, not re-processed on every request.

**Independent Test**: Load any `/[locale]/landing/[slug]` page twice in different sessions. DevTools Network tab: second load shows `_next/image?url=...` served from CDN cache (200 or 304), not a fresh request to `utfs.io` origin. No `unoptimized` attribute in the rendered `<img>` HTML.

- [x] T003 [P] [US1] Remove `unoptimized` prop from main product image in `components/shared/product/landing-page.tsx` line 84 (the `<Image fill ... unoptimized />` inside the `<motion.div>` AnimatePresence block)
- [x] T004 [P] [US1] Remove `unoptimized` prop from thumbnail images in `components/shared/product/landing-page.tsx` line 140 (the `<Image fill ... sizes="80px" unoptimized />` inside the thumbnails map)

**Checkpoint (US1 image fix complete)**: Both `unoptimized` removals verified. Build passes with `next build`. Images load correctly from `utfs.io` via Next.js image optimizer.

---

## Phase 3: User Story 3 — Fast Product Browsing (Priority: P2)

**Goal**: Cache product query results so hundreds of visitors share a single database query per hour instead of each triggering a fresh Prisma query and Vercel function invocation.

**Independent Test**: Load the home page 10 times from different browser sessions within 1 minute. Vercel Functions dashboard must show ≤ 2 invocations for the home page (not 10). Check Vercel Data Cache hit rate in dashboard — should show cache HITs after first request.

- [x] T005 [US3] Add `import { unstable_cache } from 'next/cache'` to `lib/actions/product.actions.ts` (top of file, after existing imports), then convert `getLatestProducts` (line 12) from a plain `async function` to an `unstable_cache`-wrapped export: `export const getLatestProducts = unstable_cache(async () => { const data = await prisma.product.findMany({ take: LATEST_PRODUCTS_LIMIT, orderBy: { createdAt: "desc" } }); return convertToPlainObject(data) as any; }, ['latest-products'], { revalidate: 3600, tags: ['products'] });`
- [x] T006 [US3] Convert `getFeaturedProducts` in `lib/actions/product.actions.ts` (line 199) to an `unstable_cache`-wrapped export with key `['featured-products']`, `revalidate: 1800`, and `tags: ['products']` — same pattern as T005
- [x] T007 [US3] Add `revalidateTag('products')` call to each admin mutation in `lib/actions/product.actions.ts`: in `deleteProduct` (after `revalidatePath("/admin/products")`), in `createProduct` (after `revalidatePath("/admin/products")`), and in `updateProduct` (after `revalidatePath("/admin/products")`) — also add `revalidateTag` to the existing `revalidatePath` import on line 6
- [x] T008 [P] [US3] Add `export const revalidate = 3600;` as the first export statement in `app/[locale]/(root)/page.tsx` (before the `HomePage` component declaration on line 12) to enable ISR for the home page
- [x] T009 [P] [US3] Add `export const revalidate = 3600;` as the first export statement in `app/[locale]/landing/[slug]/page.tsx` (before the `generateMetadata` function on line 5) to enable ISR for product landing pages

**Checkpoint (US3 complete)**: `next build` succeeds with no TypeScript errors. Home page and landing pages show as ISR (not dynamic) in build output. Vercel dashboard confirms Data Cache is active.

---

## Phase 4: User Story 4 — Accurate Pixel Tracking (Priority: P2)

**Goal**: Ensure Facebook Pixel events and CAPI calls fire exactly once per qualifying user action, eliminating duplicate server-action invocations caused by unstable `data` object references in the dependency array.

**Independent Test**: Open DevTools → Network tab → filter `facebook.com/tr`. Navigate to any `/[locale]/landing/[slug]` page. Reload it. Confirm exactly 1 `facebook.com/tr` pixel network request per page load, regardless of parent component re-renders or React Strict Mode double-mount behavior.

- [x] T010 [US4] Fix Facebook Pixel dependency array in `components/shared/facebook-pixel.tsx` line 42: change `}, [eventName, eventId, data]);` to `}, [eventName, eventId]);` — removing `data` from the array so the effect only re-runs when the event identity changes, not when the data object reference changes between renders. The existing `hasSentRef` guard already prevents duplicate sends within a mount.

**Checkpoint (US4 complete)**: Navigate to product landing page in React Strict Mode (dev). Network tab shows exactly 1 pixel track request. Navigating back and forward does not fire additional CAPI server actions.

---

## Phase 5: User Story 5 — Bot-Resistant Endpoints (Priority: P3)

**Goal**: Block automated bot traffic and scrapers at the Edge layer before they reach serverless functions, preventing unbounded Vercel function invocation growth from non-human traffic.

**Independent Test**: Run `for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/; done` in terminal. First 60 responses must be `200`. Responses 61–70 must be `429` with `Retry-After: 60` header.

- [x] T011 [US5] Add IP rate limiting to `middleware.ts`: (1) Add `import { NextResponse } from 'next/server'` and `import type { NextRequest } from 'next/server'` at the top; (2) Add module-level `const rateLimitMap = new Map<string, { count: number; windowStart: number }>()` with constants `WINDOW_MS = 60_000` and `MAX_REQUESTS = 60`; (3) Add `isRateLimited(req: NextRequest): boolean` function that reads IP from `x-forwarded-for` header, checks/updates the map, returns `true` when count exceeds MAX_REQUESTS, and exempts paths starting with `/api/webhooks/`; (4) At the start of the default export handler, check `if (isRateLimited(req)) return new NextResponse('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } })` before calling `intlMiddleware`

**Checkpoint (US5 complete)**: Rate limiting test passes (60 OK, then 429). Stripe webhook still processes correctly. Normal browsing (< 5 req/min) is never rate limited.

---

## Phase 6: Polish & Security Headers

**Purpose**: Add security headers that reduce attack surface across all routes and complete the hardening of the application.

- [x] T012 Update `next.config.ts` `headers()` function: add a second entry in the returned array with `source: '/(.*)'` and the following headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a `Content-Security-Policy` header with directives `default-src 'self'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://www.googletagmanager.com`, `img-src 'self' data: blob: https://utfs.io`, `connect-src 'self' https://graph.facebook.com https://vitals.vercel-insights.com`, `frame-ancestors 'none'`
- [x] T013 [P] Run `next build` locally to confirm zero TypeScript errors across all 8 modified files. Fix any type errors introduced by the `unstable_cache` wrapping (e.g., function signature changes). Verify build output shows home page and landing pages as ISR routes.
- [x] T014 [P] Execute all 5 test scenarios from `specs/001-fix-cost-drain/quickstart.md`: (1) Countdown CPU test, (2) Pixel deduplication network test, (3) Caching invocation count test, (4) Rate limiting 429 test, (5) Image optimization CDN test. Document pass/fail results as comments in quickstart.md.

**Checkpoint (All complete)**: All 5 quickstart scenarios pass. `next build` succeeds. Ready for deployment to Vercel preview environment for final invocation count validation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Phase 2A (US2)** and **Phase 2B (US1)**: Both depend only on Phase 1 — can run in **parallel with each other**
- **Phase 3 (US3)**: Depends only on Phase 1 — can start in parallel with Phase 2
- **Phase 4 (US4)**: Depends only on Phase 1 — can start in parallel with Phase 2 and 3
- **Phase 5 (US5)**: Depends only on Phase 1 — can start in parallel with Phase 2, 3, 4
- **Phase 6 (Polish)**: Depends on all story phases being complete — run last

### User Story Dependencies

- **US2 (P1)** — countdown fix: Independent, no dependencies on other stories
- **US1 (P1)** — image fix: Independent, no dependencies on other stories
- **US3 (P2)** — product caching: Independent, no dependencies on other stories
- **US4 (P2)** — pixel dedup: Independent, no dependencies on other stories
- **US5 (P3)** — rate limiting: Independent, no dependencies on other stories
- **Polish**: Depends on US1–US5 being complete

### Within Each Phase

- All tasks within a single user story phase are sequential (each file change is a discrete step)
- Tasks marked `[P]` within a phase can be executed simultaneously (T003+T004, T008+T009)

### Parallel Opportunities

- T003 + T004 (unoptimized removal) — different `<Image>` tags in same file, edit in one pass or parallel
- T005, T006 — both in `product.actions.ts`, can be done in one editing session
- T008 + T009 — different page.tsx files, fully parallel
- T013 + T014 — build verification and testing are independent activities
- **Major parallel opportunity**: Phases 2, 3, 4, 5 can all start simultaneously after Phase 1 if working with multiple developers

---

## Parallel Example: P1 Fixes (Phase 2)

```bash
# Developer A works on US2 (countdown fix):
# Edit app/[locale]/thank-you/page.tsx lines 79-90

# Developer B works on US1 (image fix) simultaneously:
# Edit components/shared/product/landing-page.tsx lines 84 and 140

# No file conflicts — completely safe to run in parallel
```

---

## Implementation Strategy

### MVP First (P1 Fixes Only — T001 to T004)

1. Complete Phase 1: Read all files (T001)
2. Fix countdown loop (T002) — stops CPU storm + eliminates spurious CAPI invocations
3. Remove unoptimized prop (T003, T004) — re-enables image CDN caching
4. **STOP and VALIDATE**: Deploy to preview, monitor Vercel dashboard for 15 minutes
5. If invocation count drops to near-zero → P1 crisis resolved

### Incremental Delivery

1. Deploy P1 fixes (T001–T004) → Validate billing reduction → **Crisis resolved**
2. Add product caching + ISR (T005–T009) → Test cache hit rate → **Further cost reduction**
3. Add pixel deduplication (T010) → Test pixel accuracy → **Marketing data cleaned up**
4. Add rate limiting + security headers (T011–T012) → Test rate limiting → **Long-term protection**
5. Final validation (T013–T014) → Full quickstart pass → **Done**

### Single-Developer Sequence (Recommended Order)

```
T001 → T002 → T003+T004 → T005 → T006 → T007 → T008+T009 → T010 → T011 → T012 → T013 → T014
```

Total: **14 tasks**, **8 files modified**, **0 new files**, **0 new dependencies**

---

---

## Phase 7: Phase 2 Fixes — New Issues (2026-03-17)

**Context**: Post-initial-fix observation — 215k requests/24hrs, 96.84 Neon CU-hrs, "Too Many Requests" on normal browsing. 5 new root causes identified.

**Prerequisites**: All Phase 1–6 tasks complete (marked ✅ above).

---

### Phase 7A: Fix Rate Limit Threshold (P0 — Fix User 429 NOW)

**Goal**: Stop the rate limiter from blocking legitimate users browsing the store normally.

- [x] T015 [US5] In `middleware.ts` line 13: change `const MAX_REQUESTS = 60` to `const MAX_REQUESTS = 120` — Next.js RSC navigation sends additional background requests per page transition, causing normal browsing to exceed 60 req/min

**Checkpoint**: Browse 10+ pages consecutively without receiving a 429 response.

---

### Phase 7B: Fix Prisma Singleton (P1 — Reduce Neon CU-hrs)

**Goal**: Prevent new PrismaClient instances from being created on every serverless cold start, reducing unnecessary Neon connection churn.

- [x] T016 [US1] Rewrite `db/prisma-db.ts` to use `globalThis` singleton pattern: (1) add `declare global { var prisma: PrismaClient | undefined }`, (2) extract adapter creation into `createPrismaClient()` function, (3) export `const prisma = globalThis.prisma ?? createPrismaClient()`, (4) add `if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma` — the production guard prevents the global assignment (module cache handles reuse in prod); the dev guard prevents hot-reload from spawning unbounded clients

**Checkpoint**: `next build` passes with no TypeScript errors. In dev, hot-reload does not create duplicate PrismaClient instances.

---

### Phase 7C: Fix Product Slug Caching (P1 — Reduce DB Queries)

**Goal**: Cache `getProductBySlug` results across requests (not just within one render) to eliminate per-visitor Neon queries on landing and product pages.

- [x] T017 [US3] In `lib/actions/product.actions.ts`: replace the `React.cache` wrapper on `getProductBySlug` (line 25) with `unstable_cache` using key `["product-by-slug"]`, `revalidate: 3600`, and `tags: ["products"]` — remove the `import React from 'react'` if it is no longer needed after this change
- [x] T018 [US3] Confirmed `revalidateTag("products", {})` is correct for Next.js 16 — the type signature is `revalidateTag(tag: string, profile: string | CacheLifeConfig)` where `{}` satisfies the optional `CacheLifeConfig`. No change needed.

**Checkpoint**: Product landing page served from Data Cache on second request — Vercel dashboard shows cache HIT. Admin product update correctly invalidates the cache (product change visible within 60s of update).

---

### Phase 7D: Fix Category Caching (P2 — Reduce DB Queries)

**Goal**: Cache the category list so pages that display categories do not hit Neon on every visitor request.

- [x] T019 [US3] In `lib/actions/category.actions.ts`: (1) add `import { unstable_cache, revalidatePath, revalidateTag } from 'next/cache'` (replace existing `revalidatePath`-only import), (2) convert `getAllCategories` from a plain `async function` to an `unstable_cache`-wrapped `const` with key `["all-categories"]`, `revalidate: 3600`, `tags: ["categories"]`, (3) add `revalidateTag("categories")` after `revalidatePath` in both `createCategory` and `deleteCategory`

**Checkpoint**: `next build` succeeds. Category list is served from cache on repeated requests. Admin category create/delete invalidates the cache.

---

## Phase 8: Final Validation (Phase 2)

- [x] T020 [P] Run `next build` to confirm zero TypeScript errors across all 5 newly modified files: `middleware.ts`, `db/prisma-db.ts`, `lib/actions/product.actions.ts`, `lib/actions/category.actions.ts`
- [ ] T021 [P] Manual smoke test: browse 10+ pages in the live store without receiving a 429 — confirm SC-008 passes. Check Vercel dashboard after 1 hour to confirm invocation count is below 10/hr with no human traffic — confirm SC-001 still passes.

**Checkpoint (Phase 2 complete)**: No 429 on normal browsing. Neon CU-hrs trending down. Build passes. All SC-001–SC-009 criteria met.

---

## Notes

- `[P]` tasks can be done in the same editing session or by different developers simultaneously
- `[Story]` label maps each task to the user story it satisfies for traceability
- The `unstable_cache` wrapping (T005, T006, T017, T019) changes functions from named `async function` to `const` — verify no import patterns break in callers
- The rate limiter Map (T011) is per-Edge-worker-instance; in-memory is unreliable across parallel Vercel Edge instances — Upstash Redis is the long-term solution but out of scope for this phase
- All changes are backward-compatible — no migrations, no API contract changes, no schema updates
- Commit after each phase checkpoint to enable easy rollback per fix
