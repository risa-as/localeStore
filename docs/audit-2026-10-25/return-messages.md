# Return-template audit — 2026-10-25

Read-only inspection of local code and the connected database. No status changes,
queue processing, historical enqueue, or customer messages were performed.

## Filter

`getWaTemplateCounts` counts distinct conversations containing an outbound template
whose stored body starts with the shared return-template prefix. It does not count
orders. The database contains 3 return-template messages in 1 conversation; the
latest is dated 2026-09-13 08:44:56 UTC. Confirmation has 2,709 messages in 2,538
conversations. The displayed return count of 1 is consistent with these records.

## Local sending policy

| Destination order status | Creates return inquiry on a new transition? |
| --- | --- |
| failed | No |
| returned | Yes |
| returnReceived | Yes |

`lib/orders/status-service.ts` creates one `return-inquiry:<orderId>` outbox entry
per order. Repeated status changes do not create additional entries. An unchanged
status returns before enqueue; existing returns are not backfilled. Processing is
scheduled after admin updates and carrier sync, with an additional cron route.
This describes local source, not a verified production deployment.

Carrier codes 15 and 19 map to returned, 17 to returnReceived. Code 32 (customer
refusal) maps to failed, so it does not trigger the return template. Several other
failed-delivery reasons share failed. Changing this message policy should not
change the inventory status mapping.

## Connected database evidence

Snapshot checked at 2026-10-25 14:26 UTC; order counts exclude archived orders:

| Status | Total | Has inquiry entry | No inquiry entry |
| --- | ---: | ---: | ---: |
| failed | 22 | 0 | 22 |
| returned | 0 | 0 | 0 |
| returnReceived | 1,711 | 2 | 1,709 |

There are only 2 return-template outbox entries, both accepted on September 13.
There are no queued, sending, review, or failed return-template entries. The
relevant status-event records contain only 3 admin-bulk events on September 13;
none records a carrier-sync transition into these statuses.

Thus this is not explained by a stuck recorded queue. Most current returns have
no recorded inquiry creation. The evidence alone cannot distinguish historical
records predating the handler, an older deployment, imports, or another writer.
Order creation dates must not be treated as return dates.

## Meta template approval

A GET-only attempt to discover template metadata failed with HTTP 400 / code 100
/ OAuthException. Current approval/paused status is unverified. This does not
explain the missing local enqueue records by itself.

## Next implementation considerations

- Confirm deployed code and active status-update path before claiming future
  transitions are covered.
- If requested, trigger the inquiry independently for failed/refused orders while
  retaining inventory status semantics and the per-order duplicate guard.
- Review historical candidates before any backfill; do not automatically contact
  all old returns as part of this audit.

Reproduce database inspection without writes:
`node --require tsx/cjs scripts/audit-return-messages-readonly.cjs`

## Follow-up after the owner's successful manual tests

Checked again at approximately 2026-10-25 15:25 UTC. The two new return-template
messages were recorded at 15:20:55 UTC (read) and 15:21:42 UTC (delivered). Both
lack `orderId`; neither generated a new status-event or return-outbox record.
They remain in the same conversation, so there are now 5 return-template messages
and still only 1 conversation. The owner's screenshot also shows `order_returned`
active in WhatsApp Manager. These observations establish that manual sends work.

The Git HEAD implementation (`b74cdec`) explains the precise manual/automatic
difference: admin edit and bulk paths directly call `sendOrderReturned`, whereas
`syncModonOrders` writes `prisma.order.update({ data: { status } })` and never calls
the sender or creates an inquiry. In current working-tree source, sync instead
calls `transitionOrder(..., 'courier-sync')`; its API route schedules the outbox
processor. The new manual messages' missing order links/events/outbox records
are consistent with the older direct-send path. This is strong runtime evidence
of a writer differing from current source, but does not by itself identify the
host/deployment executing it.

A GET-only carrier comparison returned 4,056 remote rows, without pagination
metadata. Among nonarchived locally tracked orders, 940 matched carrier code 17
and local returnReceived; all 940 lacked an inquiry. Another 13 code-17 matches
were locally completed; sync's current completed-status exclusion prevents those
from being updated. Do not automatically change completed orders based on this
audit: the intended terminal-state policy and carrier history need review.
Three locally failed orders matched carrier refusal code 32, with no inquiry.
These are current-state comparisons, not evidence of when/how status changed.

Read-only follow-up reproduction:
`node --require tsx/cjs scripts/audit-return-sync-readonly.cjs`

The direct server-action wrapper for sync currently lacks the API route's
`after(processReturnOutbox)` scheduling. The visible orders button uses the API
route, so this wrapper gap does not establish the cause of that button's behavior.
Also the API route currently returns top-level success true even if its internal
sync result indicates failure, which can conceal a failed run in the UI. No
business logic was changed during this inspection.

`node scripts/test-return-sync.cjs` passed using the actual current sync,
carrier-status mapper and transition service against synthetic PostgreSQL with a
fake GET carrier listing. Codes 15/17 create two inquiries and courier-sync events;
32 becomes failed and creates none. A repeat sync creates no duplicates, and a
later returned-to-returnReceived transition retains one inquiry for that order.
This validates local enqueue behavior, not actual Meta sending or deployment.
