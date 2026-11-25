---
name: Shifo
description: Calm, dense, table-first staff software for Uzbek private clinics.
colors:
  primary: "#0b6e69"
  primary-hover: "#08524e"
  primary-soft: "#e4f0ef"
  ink: "#1f2a30"
  ink-secondary: "#4c6272"
  line: "#d8dde0"
  app-bg: "#f6f8f9"
  surface: "#ffffff"
  row-hover: "#f1f4f5"
  ok: "#1e7b3a"
  ok-soft: "#e7f2ea"
  ok-text: "#176331"
  warn: "#b26b00"
  warn-soft: "#fbf1df"
  warn-text: "#7a4a00"
  danger: "#c2271e"
  danger-soft: "#fbeae8"
  danger-text: "#a81f17"
  info: "#1f5fa8"
  info-soft: "#e8f0f9"
  info-text: "#1a4f8c"
typography:
  title:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
  card-title:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  table:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  field:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  caption:
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  control: "6px"
  card: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 14px"
  button-outline-hover:
    backgroundColor: "{colors.row-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.control}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.control}"
  button-danger-hover:
    backgroundColor: "{colors.danger-soft}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  status-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok-text}"
    rounded: "{rounded.control}"
    padding: "2px 6px"
  status-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn-text}"
    rounded: "{rounded.control}"
  status-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.control}"
  status-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info-text}"
    rounded: "{rounded.control}"
  nav-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-hover}"
    rounded: "{rounded.control}"
    height: "36px"
  table-header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.table}"
---

# Design System: Shifo

## Overview

**Creative North Star: "The Clinic Ledger"**

Shifo's staff app reads like a well-kept ledger: white sheets with hairline rules on a pale cool-grey desk, one deep teal for the things you act on, and ink-dark text. It is built for the registrar's sixth hour on a 1366x768 monitor, so density, alignment and predictability outrank first impressions. Nothing is decorated; every surface is a bordered, solid-colour plane.

Hierarchy comes from weight (400/500/600), size steps of a pixel or two, and hairline dividers, not from shadow or colour. Colour is rationed: teal marks the primary action and the current location, and status hues appear only as icon-plus-text chips. Language is the carrier of Uzbek identity (uz Latin default, ru), not ornament. The single exception in the product brief is a faint geometric pattern on the login screen, outside the working UI; it is not part of this system.

**Key Characteristics:**
- Flat, border-defined surfaces on a cool grey app background; no gradients anywhere.
- One accent (deep teal), used sparingly; status colours carry meaning only.
- 13-14px dense tables with 44px rows, 15px form fields, 22px page titles.
- Tabular numerals for money, times, queue numbers and IDs.
- Every status is icon plus text, never colour alone.

## Colors

A restrained clinical palette: cool neutrals, one teal, four semantic hues each with a soft tint and a darker text shade.

### Primary
- **Deep Clinic Teal** (primary): primary buttons, the active-tab underline, active nav icon, focus ring, text caret and default link colour.
- **Pressed Teal** (primary-hover): hover state of primary buttons and links, and the text of the active nav item.
- **Teal Wash** (primary-soft): active nav item fill and text selection.

### Neutral
- **Clinic Ink** (ink): body and heading text.
- **Slate Secondary** (ink-secondary): labels, table headers, hints, inactive icons.
- **Hairline Grey** (line): every border and divider, scrollbar thumbs.
- **Desk Grey** (app-bg): application background and disabled field fill.
- **Sheet White** (surface): cards, sidebar, table header, inputs.
- **Row Tint** (row-hover): hover and selected table rows, outline/ghost button hover, neutral status chip.

### Semantic
- **ok / warn / danger / info** (with `-soft` fill and `-text` shade): used only inside Status chips, Notices, error notes and the destructive button's text. Chip text uses the `-text` shade on the `-soft` fill for contrast; the base hue is reserved for icons and borders.

### Named Rules
**The One Accent Rule.** Teal is the only brand colour and appears on the primary action, the current location and focus. If a screen has two teal buttons, one is wrong.

**The Never Colour Alone Rule.** A state is always tone + Lucide icon + text label, rendered through the Status component.

**The Solid Colour Rule.** No gradients, glows or translucent glass. Tints are flat `-soft` values.

## Typography

**Display Font:** none; titles use the same family.
**Body Font:** IBM Plex Sans (system-ui fallback), self-hosted via Fontsource in Latin, Latin Extended (for the Uzbek o' and g' marks) and Cyrillic, weights 400, 500, 600 only.

**Character:** One humanist-technical sans doing all work, with no pairing. Base size is 14px (html font-size), line-height 1.45.

### Hierarchy
- **Title** (600, 22px, 1.25): page title in PageHeader and KPI values.
- **Card title** (600, 15px): card header row.
- **Body** (400, 14px, 1.45): default text, nav items, buttons (md), notices.
- **Field** (400, 15px): text inside inputs and selects.
- **Table / Label** (400 or 500, 13px): table cells, table headers (500, secondary colour), field labels (500, secondary colour), small buttons, subtitles.
- **Caption** (500, 12px): status chips, hints, role line, language toggle.

### Named Rules
**The Tabular Figures Rule.** Any number compared down a column or read as an identifier (money, time, queue number, ID) gets the `num` class (tabular-nums). Default text keeps proportional figures.

**The Three Weights Rule.** 400, 500, 600 only. Emphasis is weight, not size or colour.

## Layout

Fixed 232px left sidebar on viewports at or above 1024px (lg); below that, a 48px top bar with a menu button opens the same nav as a 256px drawer. The main region has 24px side padding (16px below lg), 20px top/bottom, and content capped at 1480px, centred. Spacing follows a 4px grid (gaps of 8, 12, 16; card padding 16; table cell padding 8x12).

Pages stack: PageHeader (title left, the single primary action right, 16px below), optional Toolbar of filters (12px gaps, bottom-aligned), then a flush Card holding a table, or a KPI strip. Master/detail uses Split: list flexes, a sticky non-modal 420px panel (360px under 1100px) sits on the right. Navigation groups are separated by hairlines and filtered by permission.

## Elevation & Depth

Flat by default. Depth is conveyed by 1px hairline borders on white surfaces over the grey desk, never by shadow. The single shadow in the build is the mobile nav drawer (`0 8px 24px rgba(31,42,48,0.12)`); popovers and modals, if added, may reuse it and nothing else may.

### Named Rules
**The Border Not Shadow Rule.** Cards, tables, KPI strips and panels separate with `line` borders. A shadow is permitted only on a surface that floats over content.

## Shapes

Quiet rectangles with small radii: 6px for controls (buttons, inputs, chips, nav items, notices) and 8px for containers (cards, KPI strip). Nothing larger; no pills, no circles except spinner. Borders are 1px `line`. The only icon-bearing shapes are inline Lucide outline icons (13-20px) beside text; there are no icon tiles above headings. The logo mark is two overlapping outlined squares (an eight-point star, 2px stroke in teal) beside a 600-weight wordmark.

## Components

### Buttons
- **Shape:** 6px radius, 1px border, medium 500 weight, 8px gap to a 16px Lucide icon.
- **Primary:** teal fill, white text; md is 36px high with 14px text, sm is 32px with 13px text.
- **Hover / Focus:** fill darkens to pressed teal over 150ms; focus shows a 2px teal outline offset 2px.
- **Outline:** white with hairline border, row-tint on hover. **Ghost:** transparent, secondary text. **Danger:** white with danger-text, danger-soft on hover. Disabled is 50% opacity with not-allowed cursor; loading swaps the icon for a spinner.

### Cards / Containers
- 8px radius, 1px line border, white fill, no shadow. Optional header row of at least 48px with a 15px/600 title, actions at right, hairline below. Body padding 16px with 12px vertical rhythm, or flush for edge-to-edge tables.

### Inputs / Fields
- 38px high, 1px line border, 6px radius, white fill, 15px text, 10px horizontal padding. Hover darkens the border; focus turns the border teal with the 2px outline sitting flush. Disabled uses desk-grey fill and secondary text. Labels sit above at 13px/500 secondary; hints below at 12px. Selects use a custom chevron in secondary slate.

### Data Table
- 13px, sticky white header with secondary 500 text and a hairline below, 44px rows, 8x12px cell padding, hairline row dividers (none after last row), right-aligned numeric columns, clickable rows tint on hover and when selected.

### Status chips and Notices
- Soft fill, `-text` colour, 6px radius, 12px/500, 13px leading icon; default icons are check-circle (ok), clock (warn), x-circle (danger), info (info), circle (neutral). Notice and error note are the full-width versions with a 16px icon; errors add a danger border at 30% and role=alert.

### Navigation
- Sidebar items 36px high, 14px text, 18px outline icon, always with a label. Active: teal-wash fill, pressed-teal medium text, teal icon, aria-current. Inactive: ink text, secondary icon, row-tint hover. Footer holds user name, role, a UZ/RU toggle (active is ink fill with white text) and sign out.

### Tabs and KPI strip
- Tabs: bottom hairline, 2px teal underline on the selected tab, 14px text. KPI strip: one bordered row with vertical hairline dividers, 13px label, 22px/600 tabular value, optional 12px hint; no tiles or sparklines.

## Do's and Don'ts

### Do:
- **Do** separate surfaces with 1px `line` borders and radius 6px (controls) or 8px (containers).
- **Do** pair every status hue with its Lucide icon and text through Status or Notice.
- **Do** set money, times, queue numbers and IDs in tabular numerals.
- **Do** keep one primary action per page header, right-aligned.
- **Do** keep a visible 2px teal focus ring on all interactive elements and honour reduced motion.
- **Do** keep icon-bearing navigation labelled, with Lucide outline icons at 16-20px.

### Don't:
- **Don't** use gradients, glow, glassmorphism, purple/indigo, or dark-mode-first styling.
- **Don't** add shadows to cards or tables; only floating layers may carry the one drawer shadow.
- **Don't** use radii above 8px or large icon tiles above headings.
- **Don't** use emoji or glyph characters as icons.
- **Don't** use weights outside 400/500/600, or Inter/Roboto as the main face.
- **Don't** add Uzbek ornament to working screens.
