# Marketing workspace layout

Updated `/ar/admin/marketing` with the shared full-width admin layout and
10px corners, a compact header, selected-asset summary, localized links to
the social inbox and expense management, and clearer accessible tabs.

The publishing composer and post history share two columns on wide screens.
Existing publishing, media, history, boosting and ad controls are retained.
Connection assets use a denser grid with full names available on hover.

Publish drafts survive tab changes within the page. The ad panel mounts on
first visit and then preserves its draft too. Selecting different assets resets
the relevant drafts to avoid accidentally targeting the previous asset; the
connection UI explains this. Hidden media are paused and ad video previews use
preload=none. Insights load when their tab is opened. Drafts are not persisted
across reloads.

Missing panel data provides a reload action rather than an endless loading
message. OAuth flash-query cleanup preserves locale and unrelated parameters.
Tab keyboard navigation follows RTL arrow direction and supports Home/End.

TypeScript and focused ESLint passed. An isolated headless Chromium fixture
verified the actual marketing components and admin layout: draft persistence and
asset-reset behavior, lazy ad/insight loading, hidden-media pause, keyboard/ARIA
tabs, locale links, empty connection/data states, 10px corners and no horizontal
overflow at 320/390/768/1440/1920px in light/dark layouts. No real publishing,
advertising, deletion or Meta connection changes were made during verification.
No deployment performed.
