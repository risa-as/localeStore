# Data Model: Vercel Cost Drain Fix

**Feature**: 001-fix-cost-drain
**Date**: 2026-03-16

This feature does not introduce new database tables. It operates on existing entities and introduces two runtime constructs.

---

## Existing Entities (Relevant to Changes)

### Product
Used by caching layer. No schema changes.
- `id`: string (UUID)
- `slug`: string (unique) — cache key for `getProductBySlug`
- `name`, `description`, `price`, `images`, `stock`, `isFeatured`
- `createdAt`: timestamp — used for ordering in `getLatestProducts`
- `category`: string — used for grouping in `getAllCategories`

**Cache Tags**: All product query functions tagged `['products']` — admin mutations call `revalidateTag('products')` to bust all product caches atomically.

---

## Runtime Constructs (In-Memory, Not Persisted)

### RateLimitRecord (Edge Middleware Map entry)
Tracks per-IP request rate in the Vercel Edge runtime. Stored in module-level `Map<string, RateLimitRecord>`. Lives as long as the Edge worker instance.

```
RateLimitRecord {
  count:       number   // requests in current window
  windowStart: number   // Unix timestamp (ms) when window opened
}
```

**Key**: IPv4/IPv6 address string from `x-forwarded-for` header (first IP in list)
**Window**: 60,000ms sliding window
**Threshold**: 60 requests per window
**Eviction**: Stale entries (windowStart + 60s < now) replaced on next access

---

### SentEventSet (FbPixel component — React Ref)
Tracks which `eventId` values have already been dispatched in a given component mount. Prevents duplicate pixel fires on re-renders.

```
SentEventSet = useRef<boolean>(false)  // hasSentRef — existing field, behavior corrected
```

No changes to the ref type. The fix is in the dependency array that triggers re-evaluation.

---

## Cache Tag Topology

| Cache Key | Tag | TTL | Busted By |
|-----------|-----|-----|-----------|
| `latest-products` | `products` | 3600s | `createProduct`, `updateProduct`, `deleteProduct` |
| `featured-products` | `products` | 1800s | `createProduct`, `updateProduct`, `deleteProduct` |
| `all-categories` | `products` | 3600s | `createProduct`, `updateProduct`, `deleteProduct` |
| `product-by-slug-[slug]` | `products`, `product-[slug]` | 3600s | `updateProduct` (specific slug) |

---

## State Flow: Countdown Timer (After Fix)

```
Mount
  └─→ setInterval created ONCE (empty deps [])
        └─→ every 1s: setTimeLeft(prev => {
                if prev <= 1 → clearInterval + router.push('/ar') → return 0
                else → return prev - 1
              })
Unmount
  └─→ cleanup: clearInterval(id)
```

**Key invariant**: Exactly one interval ID exists at any point during the component lifecycle.

---

## CAPI Event Flow (After Fix)

```
LandingPage mounts
  └─→ eventId = uuidv4() (stable, useState initializer)
  └─→ useEffect([], [eventId]) — fires once
        └─→ sendCAPIEvent("PageView", eventId, {...})  [server action = 1 invocation]

FbPixel mounts with same eventId
  └─→ useEffect([eventName, eventId]) — fires once
        └─→ hasSentRef.current = false → fbq("track", "PageView", ...) → hasSentRef.current = true
        └─→ On re-render: hasSentRef.current = true → early return, NO duplicate
```

**Key invariant**: `eventId` is stable (from `useState` initializer), so the effect does not re-run on re-renders. `hasSentRef` guards against Strict Mode double-mount.
