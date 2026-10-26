# Follow-up page: daily work queue

Updated `/ar/admin/follow-up` to use the shared full-width admin layout and
10px corners. The title, introduction and section descriptions explain its
purpose: find cases needing attention, then open the relevant order or WhatsApp
conversation. An optional daily-use guide keeps the initial explanation short.

## Behavior

- Four linked summaries show message failures/reviews, unclassified customer
  rejection replies, shipments dispatched more than five days ago, and unread
  WhatsApp conversations. These are separate categories and may overlap.
- Counts now cover all matching records, rather than the latest 50 messages or
  first 30 orders. Lists use server-side pagination: 10 messages, 10 replies,
  and 12 shipments. Invalid/out-of-range page numbers are clamped.
- Message review is selected initially. Filters expose pending sends and the
  complete stored outbox history. Older failures remain accessible even when
  more than 50 newer successful messages exist.
- Accepted, delivered and read are described separately. A message send failure
  is labelled separately from the order's delivery failure.
- Rejection replies explain why they appear and what saving classification
  does. The select now has a visible, associated label.
- Shipment cards show current status, phone, tracking barcode, dispatch date
  and full days since dispatch. The five-day condition still uses dispatch
  time, not the last status-change time. Completed and received-return orders
  remain excluded, matching the previous query.
- Order links reuse the existing status-and-phone lookup helper, preserve locale,
  and fall back to order details for archived orders or unusable phone numbers.
- The refresh button calls router.refresh; it reads stored data and does not
  sync the carrier. Filter and paging links preserve the other list positions.
- Opening/refreshing/filtering the page does not send messages. Retry still
  requires explicit acknowledgement that the conversation was reviewed.
- Saving/retrying invalidates the localized follow-up page pattern so that
  updated counts/results can appear after the action.

## Verification

- TypeScript and focused ESLint passed.
- `node scripts/test-follow-up.cjs`: actual Prisma queries against synthetic
  PostgreSQL verified complete counts, old failures, filtering, exact five-day
  boundary, excluded statuses, ordering, pagination, invalid pages and empty DB.
- Isolated headless Chromium fixture used the actual page, admin layout and
  refresh button with mock data/actions. Verified links, filters, paging,
  associated fields, required retry acknowledgement, empty states, 10px corners,
  full width and no horizontal overflow at 320/390/768/1440/1920/2560px.
- Reviewed light/dark desktop and mobile screenshots. No customer messages or
  production database mutations; no deployment performed.

Outbox history only represents messages recorded by that mechanism. An empty
outbox is not proof that no returned orders or historical direct sends exist.
