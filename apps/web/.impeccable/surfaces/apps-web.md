---
version: 1
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Surface brief: Shifo staff app (apps/web)

Mode: Operate. Whole authenticated app plus the public queue screen. Code-led.

Audience: registrar (primary, 1366×768 desktop), doctors/nurses (desktop + tablet), cashier, lab, owner.
Task: find patients fast, book/reschedule, run the queue, write visits, take payments, read reports.
Constraint: product owner pinned the visual world (see PRODUCT.md Brand Commitments); no direction roll.

## Direction contract

THESIS: A clinical front-desk instrument: dense, table-first, hairline borders, one deep-teal accent, status always icon + text. Refuses the card-grid SaaS dashboard, soft shadows, icon tiles and gradients.

OWN-WORLD: Ground #F6F8F9, white surfaces separated by #D8DDE0 hairlines, text #1F2A30/#4C6272, teal #0B6E69 only for primary action, active nav, focus, links. IBM Plex Sans with tabular numerals on all money, times, ids, queue numbers. Radius 6/8, no shadows except popovers. Lucide outline icons with labels. Muted doctor tag colors. Recognizable with content removed by the 232px sidebar, 44px table rows, and mono-free tabular rhythm.

STORY: A registrar opens the app and knows within a second where the day stands (calendar grid by doctor, queue count), finds any patient by typing, and completes the booking without leaving the screen.

FIRST VIEWPORT: 1366×768: fixed 232px sidebar (wordmark, labeled nav, user + uz/ru switch at the foot), 56px page header with title and the single primary action at the right, then a full-width table or time grid with a sticky header; side panel (not modal) opens on the right for create/detail. Dashboard: four plain KPI cells in one bordered strip, two real charts, today's appointment list.

FORM: Epic/NHS-style work surface with Linear restraint; position: pinned by brief (no roll), seed: none (unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
