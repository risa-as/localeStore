# Quickstart: Vercel Cost Drain Fix

**Feature**: 001-fix-cost-drain
**Branch**: `001-fix-cost-drain`

This feature is a series of surgical bug fixes and optimizations. No new infrastructure or environment variables are required.

---

## Prerequisites

- Node.js 20+
- Existing `.env` file with all current variables (no additions needed)
- Vercel CLI (optional, for testing invocation counts locally)

---

## Files to Modify

| File | Change Type | Priority |
|------|-------------|----------|
| `app/[locale]/thank-you/page.tsx` | Bug fix — remove `timeLeft` from deps | CRITICAL |
| `components/shared/facebook-pixel.tsx` | Bug fix — remove `data` from deps | HIGH |
| `lib/actions/product.actions.ts` | Enhancement — add `unstable_cache` | HIGH |
| `app/[locale]/(root)/page.tsx` | Enhancement — add `revalidate` export | HIGH |
| `app/[locale]/landing/[slug]/page.tsx` | Enhancement — add `revalidate` export | HIGH |
| `components/shared/product/landing-page.tsx` | Fix — remove `unoptimized` prop | MEDIUM |
| `middleware.ts` | Enhancement — add rate limiting | HIGH |
| `next.config.ts` | Enhancement — add security headers | MEDIUM |

---

## Testing the Fixes

### Test 1: Countdown Timer Fix
1. Open DevTools → Performance tab → Start recording
2. Navigate to `/thank-you?orderId=test`
3. Wait 10 seconds
4. Stop recording
5. **Pass**: CPU usage flat, no accumulating JS call frames, memory stable

### Test 2: Pixel Deduplication
1. Open DevTools → Network tab → filter for `facebook.com/tr`
2. Navigate to any `/landing/[slug]` page
3. **Pass**: Exactly 1 network request to `facebook.com/tr` regardless of React Strict Mode

### Test 3: Caching
1. Open Vercel dashboard → Functions tab
2. Load home page 10 times in 60 seconds
3. **Pass**: Function invocation count ≤ 2 (initial + 1 possible background regen)

### Test 4: Rate Limiting
1. Run: `for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code}\n" https://your-store.vercel.app/; done`
2. **Pass**: First 60 responses are 200, responses 61-70 are 429

### Test 5: Image Optimization
1. Open DevTools → Network → filter `utfs.io`
2. Load a landing page twice (different browser session)
3. **Pass**: Second load hits `_next/image` CDN, not original `utfs.io` URL directly

---

## Rollback Plan

All changes are isolated to individual files. If any fix causes a regression:
1. Revert the specific file using `git checkout HEAD~1 -- path/to/file.tsx`
2. The fixes are independent — reverting one does not affect others
