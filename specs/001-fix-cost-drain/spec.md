# Feature Specification: Vercel Cost Drain Fix & Performance Audit Remediation

**Feature Branch**: `001-fix-cost-drain`
**Created**: 2026-03-16
**Status**: Draft
**Input**: Deep audit of ProStore Next.js e-commerce app — 3M requests in 20 days on free tier, 1,750 function invocations and $0.60 spend immediately on Pro with zero real human traffic

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Store Owner: Zero Surprise Billing (Priority: P1)

As the store owner, I need Vercel function invocations and bandwidth to stay proportional to real human traffic so I never receive an unexpected bill. Currently, automated internal loops and bot traffic inflate my costs far beyond legitimate usage.

**Why this priority**: This is the core crisis — the store is hemorrhaging money silently. Every hour without a fix costs real money.

**Independent Test**: Deploy to a Vercel preview environment, send zero human requests, monitor the Vercel dashboard for 1 hour. Function invocations should be fewer than 10 (health checks only).

**Acceptance Scenarios**:

1. **Given** the store is live with zero human visitors, **When** 1 hour passes, **Then** Vercel logs fewer than 10 function invocations
2. **Given** a bot hits the store rapidly, **When** the request rate exceeds 30 requests/minute from one IP, **Then** subsequent requests are rejected with a 429 response and the Vercel invocation count does not grow proportionally
3. **Given** the store home page is loaded by a real user, **When** the page renders, **Then** only one function invocation occurs — not one per component and not one per second from rogue timers

---

### User Story 2 — Customer: Stable Thank-You Page (Priority: P1)

As a customer who just placed an order, I need the thank-you page countdown timer to work correctly without freezing my browser or causing the page to crash.

**Why this priority**: The infinite interval recreation bug is both a UX catastrophe (browser CPU storm) and a server cost driver because it triggers repeated server action calls on every tick.

**Independent Test**: Open the thank-you page, observe DevTools Performance tab — CPU usage must stay flat at under 5% for the full 30-second countdown.

**Acceptance Scenarios**:

1. **Given** the thank-you page loads, **When** the 30-second countdown runs, **Then** exactly one interval is active at any time (no accumulating intervals)
2. **Given** the countdown reaches zero, **When** it expires, **Then** the user is redirected once and no extra intervals remain in memory
3. **Given** the thank-you page, **When** inspected in DevTools, **Then** memory usage does not grow over the 30-second countdown period

---

### User Story 3 — Customer: Fast Product Browsing on Repeat Visits (Priority: P2)

As a customer, I want product listings and the home page to load instantly on repeat visits because the content rarely changes.

**Why this priority**: Caching eliminates the duplicate DB queries that generate redundant function invocations AND improves user experience simultaneously.

**Independent Test**: Load the home page twice in succession (cache warm). The second load must return a cached response — no new DB query triggered, no new function invocation in Vercel logs.

**Acceptance Scenarios**:

1. **Given** the home page was loaded in the last hour, **When** a new visitor loads it, **Then** the response is served from cache without triggering a database query
2. **Given** an admin updates a product, **When** the cache is invalidated and a customer loads the product page, **Then** they see the updated data within 60 minutes
3. **Given** the product listing page, **When** 100 visitors load it within 1 minute, **Then** it triggers at most 2 database queries (not 100)

---

### User Story 4 — Marketing Team: Accurate Pixel Tracking (Priority: P2)

As the marketing team, I need Facebook Pixel and CAPI events to fire exactly once per qualifying action so ad attribution data is not polluted by duplicates.

**Why this priority**: Duplicate pixel fires inflate ad costs and make ROAS metrics meaningless. Each CAPI call is also a direct server invocation cost.

**Independent Test**: Navigate to a product page, check Facebook Events Manager — exactly one ViewContent event should appear per page visit.

**Acceptance Scenarios**:

1. **Given** a customer visits a product landing page, **When** the page renders (including in React Strict Mode double-mount), **Then** exactly one PageView CAPI event is sent to Facebook
2. **Given** a `FacebookPixel` component receives the same `eventId`, **When** the component re-renders due to parent state changes, **Then** no additional pixel events are fired
3. **Given** a customer completes an order, **When** the thank-you page loads, **Then** exactly one Purchase CAPI event fires

---

### User Story 5 — Store Owner: Bot-Resistant Endpoints (Priority: P3)

As the store owner, I need API endpoints and server actions to be resilient against bots so automated traffic cannot multiply my Vercel costs even after internal bugs are fixed.

**Why this priority**: Rate limiting is the last line of defense. Even with all internal loops fixed, external bots can still drain the quota.

**Independent Test**: Send 100 rapid requests to the home page from a single IP using a scripted client. After the first 30, all subsequent requests return 429.

**Acceptance Scenarios**:

1. **Given** a single IP sends 50 requests in 10 seconds, **When** the rate limit threshold is exceeded, **Then** the system returns 429 with a `Retry-After` header
2. **Given** a legitimate user browsing normally (fewer than 5 req/min), **When** they interact with the site, **Then** they are never rate limited
3. **Given** a Stripe webhook arrives with a valid signature, **When** the rate limit is active for that IP, **Then** it is processed normally (webhooks are excluded from rate limiting)

---

### Edge Cases

- What happens when a product cache expires mid-session — does the customer see a flash of stale content?
- How does the countdown handle the case where `timeLeft` is already 0 on mount (e.g., navigating back to thank-you page)?
- What if a Facebook CAPI call fails on the server — does any retry logic generate additional invocations beyond the original?
- What happens when a legitimate user is behind a corporate NAT proxy sharing one IP with many colleagues (rate limit false positive)?
- How does cache invalidation work when an admin performs a bulk product update affecting many items at once?

---

## Requirements *(mandatory)*

### Functional Requirements

#### R1 — Countdown Timer Fix
- **FR-001**: The thank-you page countdown timer MUST use exactly one `setInterval` for its entire active lifetime
- **FR-002**: The interval MUST be cleaned up on component unmount AND when the countdown reaches zero
- **FR-003**: The countdown `useEffect` MUST NOT include `timeLeft` in its dependency array

#### R2 — Facebook Pixel & CAPI Deduplication
- **FR-004**: Each `FacebookPixel` component MUST fire its event at most once per unique `eventId`, regardless of how many times the component re-renders
- **FR-005**: The `data` object prop passed to `FacebookPixel` MUST be reference-stable (memoized) at all call sites to prevent spurious effect re-runs
- **FR-006**: CAPI events on the landing page and thank-you page MUST be deduped — if the same `eventId` was already dispatched in the current session, subsequent dispatches MUST be skipped

#### R3 — Product Data Caching (ISR)
- **FR-007**: `getLatestProducts`, `getAllProducts`, `getFeaturedProducts`, and `getProductBySlug` MUST cache their results with a time-to-live of at least 1 hour for listing queries and 30 minutes for featured products
- **FR-008**: Cache MUST be invalidated when an admin creates, updates, or deletes a product via the admin panel
- **FR-009**: The home page and product listing pages MUST regenerate in the background at most once per hour rather than on every visitor request

#### R4 — Image Optimization
- **FR-010**: No `<Image>` component in customer-facing pages MUST use the `unoptimized` prop
- **FR-011**: All `<Image>` components using `fill` layout MUST include a `sizes` prop appropriate to their rendered dimensions

#### R5 — Rate Limiting
- **FR-012**: The Edge Middleware MUST enforce a per-IP rate limit on non-static routes
- **FR-013**: Rate-limited responses MUST return HTTP 429 with a `Retry-After` header specifying seconds until the window resets
- **FR-014**: Stripe webhook routes MUST be excluded from rate limiting
- **FR-015**: Next.js static asset paths (`/_next/static`, `/images`, `/favicon`) MUST be excluded from rate limiting

#### R6 — Security Headers
- **FR-016**: All HTML page responses MUST include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`
- **FR-017**: A `Content-Security-Policy` header MUST be configured to block inline script injection from unknown origins

#### R7 — ISR Page Exports
- **FR-018**: The home page MUST export a `revalidate` constant to enable background regeneration
- **FR-019**: Product listing and product detail pages MUST export `revalidate` to avoid per-visitor server function invocations for content that rarely changes

### Key Entities

- **Cache Entry**: A server-side cached result keyed by query parameters, with a TTL and cache tags for targeted invalidation after admin mutations
- **Rate Limit Record**: A per-IP counter with a sliding time window, tracking request count and window start timestamp
- **CAPI Event**: A Facebook Conversion API event identified by a unique `eventId`, used for deduplication on both the browser side and the server side

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With zero human visitors, the store generates fewer than 10 Vercel function invocations per hour (down from the observed thousands per hour during the crisis)
- **SC-002**: The home page and product listing serve 95% of requests from cache, triggering at most 1 database query per revalidation cycle rather than one per visitor
- **SC-003**: The thank-you page countdown runs for its full 30-second duration with CPU usage below 5% and no memory growth visible in DevTools profiler
- **SC-004**: Facebook Events Manager shows a duplicate event rate below 2% for PageView and Purchase events (down from near-100% duplication caused by Strict Mode double-mount)
- **SC-005**: A scripted bot sending 100 requests/minute from one IP is throttled after the first 30 requests — 70+ requests return 429
- **SC-006**: All product pages reflect admin changes within 60 minutes of update (ISR revalidation SLA)
- **SC-007**: Monthly Vercel Pro cost attributable to function invocations stays below $2 at normal traffic levels of fewer than 500 real daily visitors

---

## Assumptions

1. Product data changes infrequently (fewer than 20 times/day) — a 1-hour ISR revalidation window is acceptable for product listings
2. The `eventId` for CAPI events is already unique per user session/action — deduplication only needs to check within a single browser session
3. Rate limiting will use a lightweight in-memory sliding window at the Edge layer for initial implementation; can be upgraded to a distributed store (e.g., Upstash Redis) if multiple Vercel regions are needed
4. Stripe webhooks originate from Stripe's infrastructure and are excluded from rate limiting by route path pattern, not by IP allowlist
5. The `unoptimized` prop was added as a temporary workaround for an image loading issue — removing it is safe because `utfs.io` is already correctly configured as an allowed image domain
6. React Strict Mode is enabled in development (causing double-mount) and is the primary source of duplicate CAPI fires in the test environment; fixes must handle both dev and production behavior
