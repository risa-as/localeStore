# Immediate outgoing messages and customer receipts

Implemented locally on 2026-10-24:

- A bubble appears as soon as Send is pressed. Text clears into the outgoing
  bubble so the operator can type the next reply. Images/videos appear while
  uploading; an accompanying text draft stays available for a separate message.
- Each Page/platform/conversation has an ordered send queue. Other conversations
  are independent. Page/platform/conversation switches within the inbox retain
  pending and confirmed bubbles in the parent outbox. Closing/reloading the page
  with queued/in-flight work triggers a browser warning; pending work is not a
  durable background job after the browser closes.
- API acceptance displays one check / "تم الإرسال". A signed Meta delivery
  event displays two checks / "تم التسليم"; a read event displays blue checks /
  "تمت القراءة". Opening the administrator inbox does not mark a customer read.
- Explicit rejections stay in the bubble with a copy-back-to-draft action for
  text. Lost send responses remain "الإرسال غير مؤكد" and are not automatically
  retried. This avoids treating an ambiguous network failure as safe to resend.
- Current-conversation status polling runs every eight seconds while visible,
  backs off on failure, and does not block the composer or list. Remote mids
  reconcile with confirmed outbox items without content-based guessing.

## Persistence and webhook authentication

Migration `202610240002_social_inbox_delivery` was applied to the connected DB
after checking it was the only pending migration. Prisma Client was generated.
The two additive tables store Page/platform/customer watermarks and individual
message receipts. SQL GREATEST prevents delayed/duplicate callbacks regressing
status. No financial records or existing customer messages were modified.

`/api/meta/webhook` verifies the GET challenge using META_WEBHOOK_VERIFY_TOKEN
and verifies every POST over the exact raw body using X-Hub-Signature-256 and the
Meta app secret. Only assets in the authorized Meta connection are accepted.
Storage failures return HTTP 500 so Meta can retry. Facebook delivery mids and
delivery/read watermarks are supported. Instagram seen mids are supported for
the exact acknowledged message; no delivery is synthesized from an IG echo.
Subscription setup below targets Facebook Pages; IG subscriptions need the
corresponding Instagram object when that account becomes available.

## Activation still required on the published store

Read-only live inspection found only an active whatsapp_business_account app
subscription to `/api/whatsapp/webhook`; no Page app subscription and no store
Page subscription for this app. Thus real customer delivery/read events cannot
arrive yet. No Meta subscription was changed during implementation.

1. Deploy the new application code and configure META_WEBHOOK_VERIFY_TOKEN in
   the published environment. A random token is already configured in local
   `.env.local`; its value is deliberately not copied into docs or tool output.
   Use the same token in the command environment and published environment.
2. Inspect the non-mutating plan:

       node --require tsx/cjs scripts/configure-inbox-webhook.cjs --page=102993405935300 --callback=https://store.al-shafaq03.com/api/meta/webhook

3. After deployment, append `--apply` to activate Page fields message_deliveries
   and message_reads. The script first probes the public challenge endpoint,
   refuses to replace a different existing Page callback, preserves existing
   Page field subscriptions and other app objects (including WhatsApp), and
   verifies both app-level and Page-level subscriptions afterward. It never
   sends a customer message. This script was run in dry-run mode only.

The immediate UI and API-accepted check work locally. Actual customer delivery
and read checks require the published webhook and Meta subscriptions above.
Absence of a receipt is not evidence that the customer did not read the message.

## Verification

Focused Jest coverage checks raw signatures, connected-asset routing, malformed
events, status semantics, queue ordering, independent conversations, webhook
storage failures, authorization and existing inbox flows. Isolated PostgreSQL
tests run the actual new migration and persistence functions and verify
monotonic watermarks/mids, duplicate events and Page/platform/customer isolation.

An isolated headless browser with mock actions verifies immediate bubbles,
double clicks, typing during send, cross-conversation sending, Page switches,
draft preservation, explicit rejection, ambiguous send, no automatic retries,
delivery/read polling, deduplication after refresh, optimistic image preview,
and mobile layout. It uses no authenticated browser session and sends no real
messages. Screenshots are in the temporary inbox-outbox-qa directory.
