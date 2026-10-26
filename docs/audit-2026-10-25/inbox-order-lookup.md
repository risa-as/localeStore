# Direct quick replies and phone-based order status lookup

All general quick replies are now rendered directly above the composer, with
wrapping and a bounded scroll area for long libraries. The former three-item
limit and More menu are removed. Product-specific templates retain their
existing product selection behavior.

The conversation header now has a "حالة الطلب" popover. It extracts complete
Iraqi phone numbers only from incoming customer messages currently loaded,
normalizes Arabic/Persian digits and international formats, and deduplicates
them. Outgoing Page text and system notices are excluded. One number searches
automatically on opening; multiple numbers require a choice. An explicitly
selected booking phone takes precedence. Manual entry supports older/unloaded
numbers. Closing or switching conversations clears the popover state and stale
async responses cannot replace newer results.

The server action requires a fresh administrator check, validates one complete
phone using checkout validation, and queries exact local/international phone
variants. It does not use substring matching. Results cover all statuses and
include archived orders, explicitly labelled. It returns at most ten recent
orders with status, date, products/quantities, governorate, total and a detail
link. It does not expose order notes, IPs, payment data or Meta tokens.

No Meta API request is required for the order search and no schema change,
customer message or order write is performed. Changes are local; not deployed.

Verification: focused tests for incoming phone extraction, normalization,
authorization before querying, rejection of partial/ambiguous numbers, exact
search variants, bounded results and serialization. Isolated browser coverage
uses mock data and tests direct replies, automatic/manual lookup, choosing
among multiple phones, translated status/details, empty results, invalid input,
out-of-order response protection, conversation switches and mobile layout.

Follow-up: result cards now read the saved `deliveryTrackingId` (the same
barcode field used by the admin orders table) and display it, or "لم يُسجّل بعد"
when absent. Active-order detail links open the matching admin status tab and
search the order's actual saved phone, URL encoded. Archived orders retain an
explicitly labelled direct archived-order link because the status lists exclude
archived records. Focused action checks cover barcode projection and null values;
the browser fixture verifies status/phone URLs and barcode display.

Missing-phone regression: URLSearchParams stringifies an absent per-order phone
as `undefined`. Links now validate the per-order phone and fall back to the
lookup's searched phone, which was already validated. The server also supplies
the searched phone when a row omits it. With neither valid phone available, the
link opens the individual order instead of generating an unfiltered/broken
admin search. Saved international and ten-digit imported formats are retained
when valid so the orders-page text filter matches the stored value. Focused
regressions cover missing/null/empty/literal-undefined phones, country-prefix
encoding and the no-phone fallback.
