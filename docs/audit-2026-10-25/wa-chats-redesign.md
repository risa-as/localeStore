# WhatsApp inbox layout and order links

- Order chips reuse the validated shared inbox order-link helper. They open
  `/{locale}/admin/orders?status=<actual-status>&query=<saved-phone>`, falling
  back to the conversation phone when a previous thread response lacks the
  per-order phone. Archived orders retain their direct link because normal
  admin status lists exclude archived records.
- getWaThread selects/returns the order phone and archive flag for that helper.
- The separate "سجل الطلبات" header action is removed; individual order chips
  remain in the conversation header with their item tooltip.
- Compact header and counters replace the large gradient banner. The inbox
  fills the available viewport with independent list/message scrolling. Filters
  wrap visibly, the selected row is highlighted, and window status is compact.
- Page-specific corners, controls, badges, avatars, bubbles and media use 10px.
  The admin main container uses full width and 12px padding only for this inbox
  marker, as it already does for the social inbox.
- Stale thread requests cannot replace the newly selected conversation. Clicking
  an already selected conversation no longer clears it during the poll interval.

The implementation is local and has not been deployed. Focused checks cover
fresh authorization, thread order metadata, shared safe URL behavior, and a
headless browser fixture with synthetic conversations and no customer sends.
