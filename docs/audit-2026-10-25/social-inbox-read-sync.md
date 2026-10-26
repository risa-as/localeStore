# Social inbox: reply success and Meta read acknowledgement

## Evidence and scope

The supplied Meta screenshot contains the outgoing booking confirmation. Its active
filter is **unread**, and there is a newer customer thumbs-up below the confirmation.
Neither fact demonstrates a failed send. A new incoming message can legitimately
make a previously answered conversation unread again.

The client did have a separate synchronization bug: it treated a locally saved
read/send receipt as sufficient to skip Meta acknowledgement. The server can return
`marked: true, metaSynced: false` when Messenger rejects `mark_seen`; the client
ignored that distinction. Sends saved a local read receipt without requesting a
new read acknowledgement.

## Change

- Cache confirmed Meta acknowledgements independently of local read/send receipts.
- Retry failed acknowledgement on refresh, reopening, or the existing optional
  automatic refresh. Provide an explicit read-sync retry button and scoped warning.
- Acknowledge the confirmed outgoing ID after text/image/video sends, separately
  from the send operation. Do not block the composer or retry the actual message.
- Finish the scoped request even when the operator switches Pages during sending.
- Deduplicate concurrent acknowledgement of the same message. Ignore stale read
  results and avoid overwriting a newer local read/send receipt.
- Preserve the server's latest-message guard: a newer incoming message must be
  loaded before it is acknowledged. The retry button reloads the conversation.

No schema changes, customer sends, production deployment, or Meta account-setting
changes were performed. Instagram retains its existing local acknowledgement
behavior; this change does not claim new Instagram read-receipt API support.

## Verification

- TypeScript `--noEmit`: passed.
- Focused ESLint: passed (existing Browserslist age notice only).
- Jest: 80 tests passed across `inbox.test.ts`, `inbox-actions.test.ts`,
  `inbox-state.test.ts`, and `inbox-delivery.test.ts`.
- `scripts/test-social-read-sync.cjs`: actual client in isolated headless Chromium,
  mocked server actions, blocked external requests. Passed failed-read retry for
  the same locally-read ID, confirmed acknowledgement deduplication, nonblocking
  typing, post-send text/media acknowledgement, no automatic resend, scoped errors,
  newer customer message, and Page switch while a send is pending.

Run the UI check with `node scripts/test-social-read-sync.cjs` after providing
Playwright Chromium (`PLAYWRIGHT_CORE_PATH` can point to an existing installation).

## External behavior boundary

The implementation uses the documented Messenger `mark_seen` sender action:
[Meta's Messenger API collection](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api?entity=folder-22794852-6724e47b-0e25-4cb0-95cb-cd04279dd917).
Its successful response acknowledges the sender action, not a guarantee that every
Business Suite filter/workflow state has refreshed. Business Suite behavior was
not live-tested with a customer account. Do not equate send acceptance, customer
delivery/read receipts, and the Page operator's unread state.
