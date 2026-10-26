# Messenger 551 across recipients — diagnostic status

The administrator reports 551 for every attempted reply. No customer message
was sent during this audit; all live calls were Graph GETs.

Read-only diagnostic command:

    node --require tsx/cjs scripts/diagnose-messenger-readonly.cjs 102993405935300

Observed on 2026-10-24:

- Stored user and Page tokens are valid and belong to app 1659118405129311.
- Page token type is PAGE and profile_id/me.id both equal 102993405935300.
- pages_messaging is granted on the live tokens and /me/permissions.
- /me/accounts confirms the connected operator has MESSAGING and MANAGE tasks.
- Page is_published is true.
- In five recent conversations, the server-derived recipient is a participant,
  the authorized Page is a participant, and the incoming-message window is open.
- selectedPageId is currently null after the latest OAuth reconnection. This
  is not itself a send failure: inbox actions authorize the Page passed by the
  selected inbox UI against the stored authorized Page list. The diagnostic
  explicitly targets the previously reported Page instead of guessing the
  first asset.

These checks do NOT establish the root cause, the app's current Development/Live
mode, its permission review/access level, or Page messaging restrictions.
The administrator was asked to confirm mode and pages_messaging access level
from the app dashboard. The earlier switch to Development is relevant history,
not proof of the current mode or proof that it caused 551.

Follow-up: the administrator confirmed the app is currently in Development and
said replies used to work. Permission access/review level remains unconfirmed.
Asked for that level and whether native Meta Business Suite replies work, to
distinguish app eligibility from Page-wide delivery restrictions. Development
mode is a lead, not a conclusively established cause of this incident.

Later correction from the administrator: the app was actually Live, not in
Development; they report having found the mode issue and requested outgoing
message UX improvements. Do not retain Development as an established incident
cause. The new work is documented in inbox-optimistic-delivery.md.

The previous UI text overemphasized a recipient-specific explanation. It now
states delivery was rejected and directs investigation to shared configuration
when multiple customers fail. GraphError retains error_subcode and fbtrace_id;
the inbox logs those diagnostic codes without tokens, message contents or
customer identifiers. No automatic send retry or false sent receipt is added.

62 focused Graph/inbox/action regression tests pass, including rejected-send
metadata, one attempt only, no successful-send receipt, and redacted logs.
Code changes are local; no production deployment or Meta settings mutation.
