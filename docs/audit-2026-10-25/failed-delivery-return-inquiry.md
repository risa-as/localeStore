# Failed-delivery return inquiry — implementation

The owner requested that orders entering failed delivery receive the existing
WhatsApp `order_returned` template, just like returned orders.

## Behavior

- `RETURN_INQUIRY_STATUSES` is shared by transition handling, inbound reply
  association, the follow-up review list and manual reason classification.
- New transitions into failed, returned or returnReceived create the same
  `return-inquiry:<orderId>` outbox entry atomically with the status event.
- Courier code 32 remains failed, as do other failed-delivery reasons. Only the
  message policy changes; inventory and accounting status semantics are preserved.
- Repeated sync, repeated edits, rescheduling then failure again, and later
  return/physical-return transitions retain one inquiry per order. Accepted
  entries are not reset to queued.
- The staff server-action sync wrapper now schedules outbox processing, matching
  the existing API sync route and admin-edit/bulk paths.
- Failed-order customer replies can be associated with the inquiry and classified
  in the follow-up page. Existing ambiguity safeguards are unchanged.
- The inbound-message advisory-lock query now selects an integer from the lock
  function instead of returning its PostgreSQL void result. The real Prisma
  integration test previously failed to deserialize void and returned HTTP 500;
  after this correction the signed inbound webhook passes.
- No historical backfill: unchanged existing failed orders do not generate sends
  merely on refresh/sync. No live database writes or customer messages were used
  to implement or test this change.

## Verification

`node scripts/test-return-sync.cjs` exercises actual source with synthetic
PostgreSQL and a fake carrier GET response:

- Carrier 15/17/32/25 creates one inquiry for each transitioned order.
- Repeated sync and returned-to-received transition do not duplicate inquiries.
- A signed inbound customer reply associates with a failed order; duplicate
  webhook delivery does not increment unread count twice.
- The failed-order reason can be classified through the actual staff action.
- Rescheduled → failed → returned → returnReceived keeps the original accepted
  inquiry; a separate manual pending → failed transition creates an inquiry.

The integration test passed, as did TypeScript. Full-file ESLint also reported
pre-existing issues outside the changed lines: Date.now purity in the follow-up
server page, two explicit-any declarations and two unused imports in order
actions. Those unrelated lines were not changed for this feature.

Production deployment is separate. This change is implemented in the local
working tree and does not activate itself on the published store.
