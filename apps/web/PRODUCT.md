# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the front-desk registrar (registratura) of an Uzbek private clinic, working all day on a 1366×768
desktop monitor: finding patients, booking and rescheduling appointments, marking arrivals, running the queue.
Secondary: doctors and nurses in the consulting room (desktop and tablet) writing visits; cashiers taking payments;
lab staff; the clinic owner reading revenue and debt reports.

## Product Purpose

Shifo is a multi-tenant clinic management system for Uzbekistan: patients, scheduling and live queue, encounters
with ICD-10, signed visit PDFs, DHP/FHIR sync, billing with cash shifts, laboratory, SMS/Telegram reminders and
reports. Success is a registrar who never needs training twice and a doctor who finishes a visit without fighting
the screen. UI languages: Uzbek (Latin, default) and Russian.

## Positioning

Serious medical software for local clinics: clinical calm and density of an NHS/Epic/Linear class tool, adapted to
Uzbek front-desk reality (so'm money formatting, dd.MM.yyyy dates, +998 phones, uz/ru switch, live queue screen).

## Operating Context

Registratura screens are dense and table-first and are used for hours; doctor screens are calmer with large text
areas; the owner dashboard is plain KPI cards with at most two or three real charts. A separate public queue
screen is shown on a waiting-room display.

## Capabilities and Constraints

Existing Next.js 15 + React 19 + Tailwind v4 + next-intl app (apps/web). All behaviour, copy keys and API contracts
stay; this is a visual and interaction redesign. Money is always a string in so'm. Roles gate navigation.

## Brand Commitments

Binding, from the product owner:

- Mood: calm, trustworthy, clinical; "serious medical software", not a startup landing page.
- Banned: any gradients, purple/violet/indigo, glassmorphism, glow/neon, dark-mode-first, emoji as icons, big rounded
  icon tiles above headings, decorative sparklines, rounded-2xl+ cards with heavy shadows, Inter/Roboto as the main
  font, national ornaments in the working UI.
- Colors (solid only): text #1F2A30, secondary text #4C6272, borders #D8DDE0, app background #F6F8F9, surfaces #FFFFFF;
  primary deep teal #0B6E69 (hover #08524E) used sparingly; status colors semantic only and always icon + text:
  success #1E7B3A, warning #B26B00, danger #C2271E, info #1F5FA8; calendar doctor tags muted/desaturated.
- Typography: IBM Plex Sans (Latin + Cyrillic), tabular numbers for money, times, queue numbers, IDs; 13–14px dense
  tables, 15–16px forms, 20–24px titles; weights 400/500/600.
- Shape: radius 6px (inputs/buttons), 8px (cards); borders instead of shadows, one subtle shadow only on
  popovers/modals; 4px spacing grid.
- Icons: Lucide outline 16–20px, nav items always with a text label.
- Uzbek identity through language and content only; one very subtle geometric girih pattern on the login screen at
  ≤4% opacity, nowhere else.
- Logo: simple IBM Plex Sans semibold wordmark with a small geometric mark (no stethoscope/cross/heart); placeholder ok.
- Accessibility: WCAG 2.2 AA, visible focus rings, never color alone for status. Optimize for 1366×768.

## Evidence on Hand

Working app with real flows (verified by Playwright E2E), a synthetic demo clinic seeded by `pnpm db:seed`. No real
patient data, no testimonials, no customer logos exist and none may be invented.

## Product Principles

- Dense and scannable first: the registrar's hour 6 matters more than first impressions.
- Status is never color alone; every state carries icon and text.
- Calm over clever: restraint, borders, one accent.
- Clinical data is handled with visible care (audit, immutability, consent) and never decorated.

## Accessibility & Inclusion

WCAG 2.2 AA; keyboard operable with visible focus rings; uz-Latn and ru copy parity.
