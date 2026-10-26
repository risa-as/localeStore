# Selected booking fields and grouped comments

Only the two requested workflow changes are included:

1. Selecting text inside an incoming customer message shows "استخدم كهاتف" and
   "استخدم كعنوان" above the composer. Page replies, system notifications,
   selections outside the message area and selections spanning multiple items
   are excluded. Phone selection must be one complete valid Iraqi number and
   uses the same phone validator as checkout, with Arabic/Persian digits and
   +964/00964 normalized. Address selection retains the selected wording and
   must meet the existing 3–1000 character limits.
2. Top-level comments on the currently selected post are grouped by author id,
   with Instagram username as a fallback. Display names and anonymous authors
   are never used to merge customers. Every distinct comment remains visible
   with its time and its own reply/thread actions. A reply targets the exact
   chosen comment, and only that comment gets the existing session-level
   handled indication. Additional loaded pages merge into the same groups.

Selected phone/address values are attached to Page/platform/conversation in
the parent inbox state. Preparing the order does not overwrite them with the
automatic extractor. Reopening a prepared draft preserves its other local
fields, and switching conversations/Pages keeps the selected phone/address
separate. Values are in-memory drafts, not durable customer records after a
full page reload. Booking still requires explicit approval and the shared
landing-page validation/reservation/duplicate checks.

Grouping covers loaded comments on one post, not all historical comments or
other posts. When Meta omits author identity, comments remain separate rather
than guessing the customer. Grouping does not mark all a customer's comments
as answered after replying to one.

No schema migration or external Meta mutation was needed for these changes.
Verification uses mocked actions and an isolated browser fixture, alongside
focused tests for phone/address normalization, author metadata, grouping,
pagination identity and existing order/inbox behavior.

Verification completed: 81 focused Jest tests, TypeScript and focused ESLint
pass. The isolated browser fixture passed selected-phone/address transfer,
invalid/outgoing selection exclusion, preservation of an already edited draft,
per-conversation isolation, mobile layout, same-name/anonymous separation,
group merging after pagination, exact comment reply targeting, per-comment
handled indication and separation between posts. No real order or Meta message
was created by these checks. Changes remain local; no production deployment.
