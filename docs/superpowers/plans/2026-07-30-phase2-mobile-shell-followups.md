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
