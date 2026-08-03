# Phase 2 mobile shell — deferred follow-ups

Shipped 2026-07-31 (`main` @ `2341127`). These were found during implementation or review, judged non-blocking, and deliberately left. Ranked by my estimate of what a coach would actually notice.

> **Update 2026-08-01 (`main` @ `07b0091`).** A follow-up batch shipped: an add-event FAB on Schedule, responsive Team Schedules and Field Calendar, and desktop-only exports/`Clear All`. It resolved item 1 below and added one new limitation — see "Added by the 2026-08-01 batch" at the end.

## Worth doing in the next mobile pass

1. ~~**The month grid's `+` is a 36×36px target.**~~ **RESOLVED 2026-08-01.** It was worse than recorded here: the Agenda view — the phone's *default* — had no add affordance at all, so there was no way to add an event from the view the app opens on. The reasoning in this item ("no FAB was built, deliberately, because making the hover-only `+` visible was the cheaper fix") was wrong: it only held for the month grid. A FAB now exists on Schedule and on Field Calendar, both routing through `EventModal`.

2. **Practice cards have no Directions button.** Game cards got Call coach + Directions; practice cards got the inline weather strip only, per plan scope. A practice has a field and a coach driving to it needs directions just as much. Cheap to add — the same `mapsUrl` / `geocoords` logic already exists in `DashboardTab.tsx`.

3. **Sheets have no focus management.** `MobileNav.tsx`'s sheets set `role="dialog" aria-modal="true"` and handle Escape and backdrop-click, but do not move focus into the sheet, trap it, or restore it to the invoking button on close. Keyboard and screen-reader users can tab behind the sheet. This is the largest remaining a11y gap in the shell and pairs naturally with **Phase 2 item 3's a11y pass** (real WAI-ARIA tablist, roving tabindex, `aria-pressed` confirm, `?` disclosure).

4. **Tapping the bottom bar while the More sheet is open only closes the sheet.** The backdrop (`z-50`) covers the bar (`z-40`), so the tap lands on the backdrop. One wasted tap, not broken — but "tap Schedule while More is open" is a natural gesture.

5. **`Sheet` double-announces its title** — it sets both `aria-label={title}` and renders a visible `<h2>{title}</h2>`. `aria-labelledby` pointing at the heading would be cleaner.

## Known limits, not bugs

- **`mobileNav.test.ts`'s `NAV_ORDER` is a hand-maintained mirror** of `NAV_GROUPS` in `page.tsx`. It has to be — `NAV_GROUPS` lives inside the component body and the lib must stay runnable under `npx tsx`. A twelfth tab added to `NAV_GROUPS` but not to `NAV_ORDER` would not be caught by the test. It *would* still be invisible on desktop, which is the louder signal.

## Still unverified from Phase 0/1

- **The expired banner and tier-aware upgrade copy have never been seen.** None of the 9 lapsed accounts owns a league. To see them: take an unstarted trial, generate a schedule, then backdate `subscription_end`. The trial bar, the expired banner and the mobile trial pill all share the header region — verify them in one pass.
- **The locked-edit toast** was skipped in Phase 0 on the grounds that a persistent banner plus disabled inputs was enough. On a phone the banner scrolls away while the disabled controls stay on screen, so this is worth revisiting now that the mobile shell exists.

---

## Added by the 2026-08-01 batch

**Field Calendar is add-only on phones.** Its month grid now shows a count badge per day instead of unreadable ~50px chips, and the per-day `+` moved to a FAB (a 24px day circle plus any usable `+` cannot fit a 51px cell — measured). But unlike Schedule, this tab has no list/agenda view for a tap to reach, so on a phone you can see that a day is busy and add to it, but **not open an existing event**. A `sm:hidden` caption states this to the user rather than leaving a silent dead end.

This is the top remaining mobile item. The roadmap's original wording for the mobile shell was "agenda-first calendar**s**", plural — Field Calendar is the one that never got it. Giving it the same agenda list the Schedule tab has would close the gap and delete the caption.

**Two things the batch did not touch**, both cosmetic rather than broken:
- The Schedule tab's filter block still consumes ~200px before the first event on a phone.
- A phone-only admin can no longer export or clear the schedule; those moved to desktop. Revisit with a `⋯` menu if anyone actually needs them.

---

## Added by the coach view-only page (2026-08-02, `main` @ `dab5896`)

Phase 2 item 2 shipped. A share-link viewer now gets a purpose-built read surface instead of the admin interface: team picker (remembered per-league under `fd-coach-team:<viewToken>`), next-game hero with Directions and weather, league schedule with YOURS tags, standings with the picked row highlighted, and the "run your own league free" footer on every panel.

**Deliberately not built, and why:**
- **Add to calendar.** The only genuinely new capability on the prototype, no code in the repo, filed under Phase 4, and its behaviour varies across iOS and Android in ways this environment cannot verify. A silently broken "Add to calendar" on a parent's phone is worse than its absence. Directions ships; calendar does not.
- **The Coaches and Field Calendar tabs**, which a viewer used to reach. Dropped per the prototype. If parents ask for coach phone numbers, the cheap answer is a contact row on the Next panel, not restoring a whole tab.

**Known limits:**
- The team picker has no Escape handling, focus trap, or focus restore — only backdrop-click closes it. `MobileNav`'s sheet *does* handle Escape, so the two are inconsistent. Pairs naturally with **Phase 2 item 3's a11y pass**, which is the last item in this phase.
- The Schedule panel caps at 200 events with no indicator; a very large league's later dates silently drop off.
- Desktop tab buttons are ~40px tall, under the 44px guideline. Mobile is 56px.

**Caught in review, worth remembering:** the first version showed a stranger's game as the hero to every first-time visitor (because "no team picked" means "whole league" to the selection logic), dropped the league's theme, and hid special events like Opening Day that the old share view displayed. All three were regressions invisible to the type checker and the unit tests — only a browser pass against real data found them.

---

## Phase 2 complete (2026-08-02, `main` @ `1eb9053`)

Item 3 — standings detail + a11y pass — shipped, closing Phase 2. On a phone the standings now show rank / team / W-L / PCT with a tap-row detail (games back, streak, last five, runs split, recent results, next game, coaches) instead of hiding six columns off the right edge. The desktop nav is a real WAI-ARIA tablist with arrow-key navigation, the Confirm explanation is a keyboard-operable disclosure, month-grid chips carry division initials, and all three dialogs trap and restore focus.

**Verified live at 390px against the production league** (the only one with recorded results; read-only view): 23-row list, detail reading "3-2 Record / .600 PCT / 0.5 Games back / L1 Streak", and the multi-division gate holding — opening one division's detail leaves the others' lists intact. Keyboard verified at 1280px: arrows follow visual order, both wraps work, focus follows selection.

### Still open, ranked

1. **Field Calendar is add-only on phones** (from the mobile-gaps batch). It shows how many events a day holds but not what they are, because unlike Schedule it has no agenda view to reach. The roadmap's original wording was "agenda-first calendar**s**", plural — this is the one that never got it. Top remaining mobile item.
2. **`aria-describedby` on the Confirm checkbox is set only while the disclosure is open**, so a screen-reader user reaching the checkbox hears no hint that an explanation exists until they have already found the `?` button. `aria-controls` also dangles when collapsed.
3. **The tablist's presentational wrappers are a tolerated shape, not a conforming one.** `role="presentation"` on a plain `<div>` strips nothing (generics carry no semantics), so the tabs remain three levels deep inside the tablist. Assistive tech copes; `aria-owns` on the `<nav>` listing the eleven tab ids would make it correct.
4. **Two divisions whose names share initials get identical chip badges** (e.g. "Majors" and "Men's Alumni" → "MA"), so for that pair the greyscale fix does nothing. Degrades to today's colour-only behaviour rather than being worse.
5. **Focus-trap selector** doesn't exclude `display:none` or disabled descendants. Latent — no current sheet has any.
6. **Recent results render raw ISO dates** (`2026-05-05`) where the rest of the app formats them.
7. **Practice chips carry a division badge** whose text colour is the hardcoded gray rather than the division palette, so the contrast rationale written for division chips doesn't literally cover them. Still legible.
8. **The Schedule filter block** still consumes ~200px before the first event on a phone.

### Correction worth keeping

An earlier note in this session claimed a division cannot have a blank name. That is wrong: `DivisionsTab`'s rename neither trims nor rejects, so clearing the field stores `''`. The consequence is harmless — such a division has a blank header anyway — but the reasoning shouldn't be reused.
