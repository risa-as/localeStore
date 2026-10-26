# Follow-up / WhatsApp unread count mismatch

The follow-up page counted every `WaConversation` with `unreadCount > 0`.
The inbox loaded the latest 100 conversations, then filtered and counted those
rows in the browser. Older unread conversations were therefore omitted. Its
header also summed unread messages while its filter counted conversations.

## Fix

- Shared unread-conversation predicate used by the follow-up page and inbox.
- Inbox status filters (`unread`, `open`, `closed`) run before the database's
  100-result limit, alongside search and template filters.
- Counts cover all matches for the current search/template, independent of the
  selected status and displayed-result limit. Header explicitly counts unread
  conversations. The result caption distinguishes displayed rows from the total.
- Initial server render applies URL filters, including the follow-up unread link.
- List and counters refresh together in one server action. First successful
  opening of a thread refreshes them immediately after marking it read.
- Late responses from a previous filter/search cannot replace the current list.
- Existing thread rendering, customer orders, message sending and template
  delivery policies remain unchanged. No historical unread flags were cleared.

## Verification

- `node scripts/test-wa-inbox.cjs`: actual Prisma queries with synthetic
  PostgreSQL reproduce 18 unread conversations, only 7 of them in the latest
  100. All 18 are returned by the unread filter; the follow-up count agrees.
  Also verifies older open windows, exact expiry, search/template combinations,
  duplicate template messages counted once per conversation, authorization,
  empty results, and both counts decreasing to 17 after reading one thread.
- `node scripts/test-follow-up.cjs`: existing follow-up count/pagination tests.
- `lib/meta/wa-thread.test.ts`: 3 existing authorization/order-metadata tests pass.
- Isolated Chromium fixture with actual server page/client verifies initial unread
  deep link, complete counts, immediate read refresh, combined filters, stale
  response protection, and 320/390/1440px layouts. All actions use synthetic data;
  no real messages were sent or production unread flags changed.
- TypeScript and focused ESLint checked. No deployment performed.

The inbox still displays at most the latest 100 matches for a selected filter;
the counter can exceed 100 and the result caption explicitly states the limit.
Counts on separate pages can naturally change between loads when messages arrive
or another staff member reads a conversation.
