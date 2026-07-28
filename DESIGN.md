---
name: FieldDay Planner
description: A league-scheduling SaaS for youth/rec sports admins and coaches
colors:
  navy-primary: "#00013a"
  navy-deep: "#000128"
  navy-light: "#b0c0e0"
  navy-muted: "#8898c0"
  crimson-accent: "#cd163f"
  crimson-accent-hover: "#b01235"
  surface-white: "#ffffff"
  surface-gray: "#f9fafb"
  border-gray: "#e5e7eb"
  text-gray-900: "#111827"
  text-gray-500: "#6b7280"
  danger-bg: "#fef2f2"
  danger-border: "#fecaca"
  danger-text: "#b91c1c"
typography:
  headline:
    fontFamily: "Oswald, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontWeight: 700
    letterSpacing: "0.02em"
  body:
    fontFamily: "Barlow, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.navy-primary}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.navy-deep}"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.xl}"
  card-highlighted:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.xl}"
---

# Design System: FieldDay Planner

## 1. Overview

**Creative North Star: "The Season Ledger"**

FieldDay Planner is the record a league admin trusts to run a season without drama: divisions, fields, umpires, standings, one page each, filed cleanly. Navy (`#00013a`) is the ledger's ink — authoritative, unhurried, used everywhere structure needs weight. Crimson (`#cd163f`) is the red pen — reserved for what needs a decision or a warning, never decorative. The system rejects sports-poster theatrics (no jersey numbers, no gradient scoreboards, no stadium-lights motifs) in favor of the crispness of a tool a league pays $99–$399/year for and expects to just work.

Six swappable league themes (Forest, Ocean, Royal, Sunset, Midnight Gold, plus the FieldDay Red default) let a league recolor the ledger without changing its structure — the ink color changes, the ledger format doesn't.

**Key Characteristics:**
- Flat-to-layered hybrid: most surfaces sit flat, shadow appears specifically to mark emphasis (the "Most Popular" plan, an active modal)
- One primary ink color per theme, one accent color, nothing else competing for attention
- Oswald headlines (condensed, tracked-out, athletic) paired with plain Barlow body copy — the one place personality shows through
- No dark mode; the ledger is always read in daylight

## 2. Colors

Navy-and-crimson by default, but the palette is a role system, not a fixed pair — the theme layer swaps both colors per league while keeping every other token stable.

### Primary
- **Ledger Navy** (`#00013a`): the primary ink. Headlines, primary buttons, active nav states, "Most Popular" plan border. Carries authority; used generously because it reads as structure, not decoration.
- **Ledger Navy Deep** (`#000128`): hover/pressed state for navy surfaces.

### Secondary
- **Red Pen Crimson** (`#cd163f`): the accent. Focus rings, destructive/urgent actions, the one warm note against the cool navy. Used sparingly — it marks "pay attention here," not "this is pretty."
- **Red Pen Crimson Hover** (`#b01235`): hover/pressed state for crimson surfaces.

### Neutral
- **Ledger Paper** (`#ffffff`): card and surface background.
- **Ledger Room** (`#f9fafb`): page background behind cards.
- **Ledger Rule** (`#e5e7eb`): borders, dividers, unfocused input strokes.
- **Ink Body** (`#111827`): primary text (headings, values).
- **Ink Faded** (`#6b7280`): secondary text, captions, helper copy.

### Named Rules
**The Red Pen Rule.** Crimson never fills a surface. It marks a focus ring, a hover state, a "most popular" badge, a destructive action, an error border. If crimson is covering more than a badge or a button, it's being used wrong.

## 3. Typography

**Headline Font:** Oswald (condensed, athletic, tracked-out 0.02em)
**Body Font:** Barlow (plain, legible, no personality of its own)

**Character:** Oswald carries all of the system's sports identity in a system that otherwise avoids sports iconography — condensed caps read as scoreboard/roster typography without needing an actual scoreboard graphic. Barlow gets out of the way for dense operator data (rosters, schedules, standings tables).

### Hierarchy
- **Headline** (Oswald, 700, tracked 0.02em): page titles, section headers, plan names on `/pricing`.
- **Title** (Oswald, 600, ~1.125–1.25rem): card headers, tab labels, modal titles.
- **Body** (Barlow, 400, 1.5 line-height): form labels, table cells, descriptions. Cap prose blocks at 65–75ch even inside wide dashboard cards.
- **Label** (Barlow, 500–600, small, sometimes uppercase): badges ("Most Popular"), button text, status chips.

### Named Rules
**The One Display Font Rule.** Oswald is reserved for headings and short labels only. It never runs in paragraph-length body copy or dense table data — condensed caps at length hurt scanability, which matters most for a coach glancing at a schedule on mobile.

## 4. Elevation

Layered, not flat: white cards sit on a light gray page (`#f9fafb` on `#f9fafb`-adjacent), separated by both a soft border and a shadow rather than color contrast alone. Shadow intensity is a signal, not ambient texture — a plain plan card gets `shadow-sm`, the highlighted/"Most Popular" plan gets `shadow-lg` plus a 2px navy border, so elevation literally marks importance.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)` / Tailwind `shadow-sm`): default card elevation — pricing tiers, dashboard tabs, standard containers.
- **Emphasized** (`box-shadow: 0 10px 15px rgba(0,0,0,0.1)` / Tailwind `shadow-lg`): the one highlighted item in a set (recommended plan, active/selected state). Never apply to more than one element in the same view — its meaning is "this one."

### Named Rules
**The One Shadow-Lg Rule.** At most one element per screen carries the emphasized shadow. If two things are both trying to stand out, neither does.

## 5. Components

Buttons and interactive elements should feel tactile and athletic — confident weight, a visible press/hover state — inside an otherwise restrained, professional shell. The tactility lives in the interaction, not in decoration.

### Buttons
- **Shape:** rounded-lg to rounded-xl (`8–16px` radius), never fully square, never pill-shaped except status badges.
- **Primary:** navy background (`#00013a`), white text, `12px 24px` padding, `font-semibold`. Full-width on plan cards and forms.
- **Hover / Focus:** background darkens to Ledger Navy Deep (`#000128`) on hover; focus ring uses crimson (`ring-2 ring-[var(--fd-accent)]`) for keyboard/tap feedback — the one place crimson appears on every interactive control, giving buttons their "athletic" snap.
- **Secondary / Ghost:** transparent background, gray text (`text-gray-500`), darkens to `text-gray-700` on hover — used for lower-priority actions like "Manage billing" under a primary CTA.
- **Disabled:** `opacity-50`, no hover state.

### Cards / Containers
- **Corner Style:** `rounded-2xl` (16px) for primary containers (pricing cards, page sections), `rounded-xl` (12px) for nested/smaller cards.
- **Background:** white (`#ffffff`) on a light gray page.
- **Shadow Strategy:** see Elevation — resting `shadow-sm` by default, `shadow-lg` + 2px navy border only for the emphasized item.
- **Border:** 1px `border-gray-200` at rest; 2px navy on the emphasized card.
- **Internal Padding:** generous, `p-6` to `p-8`.

### Inputs / Fields
- **Style:** full-width, 1px border, `rounded-lg`, `px-3 py-2`, `text-sm`.
- **Focus:** 2px crimson ring (`ring-[var(--fd-accent)]`), no border color change — the ring alone signals focus.
- **Disabled:** `opacity-50`, gray-50 background.

### Badges / Labels
- **Style:** `rounded-full`, navy background, white text, `text-xs font-semibold`, tight padding (`px-3 py-1`) — used for "Most Popular" and similar single-word status markers.

### Navigation / Tabs
- Tab-based dashboard shell (Setup, Divisions, Fields, Umpires, Schedule, Standings, Coaches, etc.). Active tab should carry the navy ink treatment (background or underline in navy); inactive tabs stay gray text. Mobile: tabs must remain reachable via horizontal scroll or a condensed menu, since coaches are checking these one-handed.

## 6. Do's and Don'ts

### Do:
- **Do** use Oswald only for headlines, titles, and short labels — never for paragraph or table body text (The One Display Font Rule).
- **Do** limit crimson to focus rings, hover accents, single badges, and destructive/urgent actions (The Red Pen Rule).
- **Do** reserve `shadow-lg` for exactly one emphasized element per view (The One Shadow-Lg Rule).
- **Do** keep interactive elements (buttons, inputs, tabs) tactile: visible hover/press/focus states, since the brief calls for "tactile and athletic" components inside a professional shell.
- **Do** design every dashboard surface to work at both a desktop setup session and a one-handed mobile glance, per PRODUCT.md's two-audience principle.
- **Do** respect WCAG AA contrast when leagues swap in a different theme (Forest, Ocean, Royal, Sunset, Midnight Gold) — verify navy/crimson-equivalent pairs per theme, not just the default.

### Don't:
- **Don't** introduce sports-poster theatrics — jersey numbers, gradient scoreboards, stadium-lights or turf-texture motifs. PRODUCT.md calls for "professional, polished, trustworthy," not athletic-loud.
- **Don't** let crimson cover a full surface or large background area; it's an accent, never a fill.
- **Don't** apply `shadow-lg` to more than one card/element in the same screen.
- **Don't** ship a generic stock-admin-template look — every screen should read as FieldDay Planner's ledger system, not a default Tailwind dashboard starter.
- **Don't** rely on color/hue alone to distinguish standings or schedule states; the theme-swapping system means a hue that works in Ledger Navy may not carry the same meaning in Sunset or Midnight Gold.
- **Don't** add dark mode without a deliberate decision — none exists today and PRODUCT.md doesn't call for it.
