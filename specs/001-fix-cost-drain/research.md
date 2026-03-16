# Research: Vercel Cost Drain Fix

**Feature**: 001-fix-cost-drain
**Date**: 2026-03-16

---

## Decision 1: useEffect Countdown Fix Strategy

**Decision**: Remove `timeLeft` from the dependency array. Use an empty deps array (`[]`) with a purely functional updater `setTimeLeft(prev => prev - 1)`. Add a `useRef` to hold the interval ID for imperative cleanup.

**Rationale**: The `setInterval` callback only needs `setTimeLeft` (stable function reference) and the router (added via `useRef` to avoid re-triggering effect). A single interval created on mount is the correct pattern. The `if (timeLeft === 0)` guard should move into the interval callback itself using the functional updater pattern.

**Pattern (Before)**:
```tsx
useEffect(() => {
  if (timeLeft === 0) { router.push('/ar'); return; }
  const id = setInterval(() => setTimeLeft(p => p - 1), 1000);
  return () => clearInterval(id);
}, [timeLeft, router]); // BUG: recreates interval every second
```

**Pattern (After)**:
```tsx
const routerRef = useRef(router);
useEffect(() => {
  routerRef.current = router;
}, [router]);

useEffect(() => {
  const id = setInterval(() => {
    setTimeLeft(prev => {
      if (prev <= 1) {
        clearInterval(id);
        routerRef.current.push('/ar');
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => clearInterval(id);
}, []); // FIXED: runs exactly once on mount
```

**Alternatives considered**:
- Using a `useRef` for `timeLeft` — more complex, readable pattern above is simpler
- Removing countdown entirely — rejected, UX feature is intentional

---

## Decision 2: Facebook Pixel Deduplication

**Decision**: Change `FbPixel` dependency array from `[eventName, eventId, data]` to `[eventName, eventId]` only. The `data` object is already memoized at call sites via `useMemo`. For extra safety, store `eventId` in a `Set` ref to prevent cross-remount duplicates.

**Rationale**: The `data` object being in the dependency array means any parent re-render that recreates the `data` object (even with same values) will re-trigger the effect. The `eventId` is the true deduplication key — it's unique per event occurrence. The `hasSentRef` already guards against same-instance duplicates.

**Pattern (Before)**:
```tsx
useEffect(() => { ... }, [eventName, eventId, data]); // BUG: data reference changes
```

**Pattern (After)**:
```tsx
useEffect(() => { ... }, [eventName, eventId]); // FIXED: stable primitive deps only
```

**Alternatives considered**:
- Deep-comparing `data` with `useRef` — overkill, `eventId` uniqueness is sufficient
- Module-level `Set` for sent event IDs — valid extra defense, add as optional enhancement

---

## Decision 3: Product Caching with unstable_cache

**Decision**: Wrap `getLatestProducts`, `getFeaturedProducts`, `getAllCategories` with `unstable_cache` from `next/cache`. Use cache tags (`['products']`) for targeted invalidation. Set `revalidate: 3600` (1 hour) for listings, `revalidate: 1800` (30 min) for featured.

**Rationale**: `unstable_cache` is the correct Next.js 15 App Router mechanism for caching server-side data fetch results beyond a single request. Using cache tags allows `revalidatePath` calls in admin mutations to bust the cache instantly without waiting for TTL expiry.

**getProductBySlug** already uses `React.cache()` which deduplicates within a single request. For cross-request caching, `unstable_cache` is needed.

**Pattern**:
```ts
import { unstable_cache } from 'next/cache';

export const getLatestProducts = unstable_cache(
  async () => {
    const data = await prisma.product.findMany({ ... });
    return convertToPlainObject(data);
  },
  ['latest-products'],
  { revalidate: 3600, tags: ['products'] }
);
```

**Admin mutations already call `revalidatePath('/admin/products')`** — these need to also call `revalidateTag('products')` to bust the cache.

**Alternatives considered**:
- Redis external cache — too complex for this traffic level, `unstable_cache` uses Vercel's built-in Data Cache
- `fetch` with `next: { revalidate }` — not applicable because we use Prisma (not fetch)
- Force-static export — not viable because product data is dynamic

---

## Decision 4: ISR for Static Pages

**Decision**: Add `export const revalidate = 3600` to the home page and landing page route files. This tells Next.js to regenerate them in the background at most once per hour.

**Rationale**: The home page currently has no `revalidate` export. Without it, Vercel treats the page as fully dynamic (generates a new response per request) because it calls async Server Components. Adding `revalidate = 3600` triggers ISR: first visitor gets a generated page, subsequent visitors get the cached version until 1 hour passes.

**Pages to update**:
- `app/[locale]/(root)/page.tsx` — home page, calls `getLatestProducts` + `getFeaturedProducts`
- `app/[locale]/landing/[slug]/page.tsx` — product landing page, calls `getProductBySlug`

**Alternatives considered**:
- `force-static` — incompatible with cookie-based session cart in middleware
- `force-dynamic` — this is the current implicit behavior, we're moving AWAY from it
- Short revalidate (60s) — too frequent, doesn't reduce invocations meaningfully

---

## Decision 5: Rate Limiting in Edge Middleware

**Decision**: Implement IP-based sliding window rate limiting directly in `middleware.ts` using an in-memory `Map`. Limit: 60 requests per minute per IP. Return 429 with `Retry-After` header.

**Rationale**: Vercel Edge Middleware runs at the CDN edge before the serverless function. This is the cheapest possible place to block traffic — a blocked request never reaches the serverless runtime, so no function invocation is billed. An in-memory Map works per-instance (each edge node has its own map). This is sufficient for abuse prevention; a distributed rate limiter (Upstash Redis) can be added if needed.

**Exempt routes**: `/_next/static`, `/images`, `/favicon`, `/api/webhooks/stripe`

**Alternatives considered**:
- Upstash Redis distributed rate limiter — more robust across regions but adds dependency and cost; defer to future upgrade
- Vercel Firewall (Pro feature) — valid option but code-level is more portable and free
- Cloudflare in front of Vercel — architectural change, out of scope

**Implementation**:
```ts
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
```

---

## Decision 6: Security Headers

**Decision**: Add security headers in `next.config.ts` `headers()` function targeting all HTML routes (`source: '/(.*)'`).

**Headers to add**:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing attacks
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer data leakage
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — disables unused browser APIs
- `Content-Security-Policy` — restrict script/style sources (start with permissive, tighten over time)

**Alternatives considered**:
- Headers in middleware — works but next.config.ts is the canonical place, runs at CDN level
- Third-party security service — out of scope

---

## Decision 7: Remove unoptimized Prop

**Decision**: Remove `unoptimized` from `landing-page.tsx` (main image and thumbnails) and `admin/products/page.tsx`. The `utfs.io` domain is already correctly configured in `next.config.ts`.

**Rationale**: The `unoptimized` prop was likely added because images from `utfs.io` weren't loading (common during initial setup). Since the domain is now in `remotePatterns`, the prop is no longer needed. Removing it re-enables Vercel's image optimization cache — images are processed once and served from CDN on subsequent requests.

**Alternatives considered**:
- Keeping `unoptimized` for thumbnails — rejected, thumbnails benefit most from optimization (small, repeated)

---

## Summary of All Decisions

| # | Area | Decision | Cost Impact |
|---|------|----------|-------------|
| 1 | Countdown loop | Remove timeLeft from useEffect deps | Stops repeated server action calls |
| 2 | Pixel dedup | Remove `data` from deps array | Stops 2× duplicate CAPI invocations |
| 3 | Product cache | Wrap queries with `unstable_cache` | 99% fewer DB query invocations |
| 4 | ISR pages | Add `revalidate = 3600` to home/landing | Per-visitor → per-hour invocations |
| 5 | Rate limiting | Edge middleware IP sliding window | Blocks bot traffic before invocation |
| 6 | Security headers | Add to next.config.ts | Reduces attack surface |
| 7 | Image optimization | Remove `unoptimized` prop | Reduces image pipeline calls |
