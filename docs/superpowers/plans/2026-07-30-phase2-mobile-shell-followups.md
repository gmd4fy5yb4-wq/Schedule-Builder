# Phase 2 mobile shell — deferred follow-ups

Shipped 2026-07-31 (`main` @ `2341127`). These were found during implementation or review, judged non-blocking, and deliberately left. Ranked by my estimate of what a coach would actually notice.

## Worth doing in the next mobile pass

1. **The month grid's `+` is a 36×36px target.** It is the *only* way to add an event from a phone — no floating action button was built, deliberately, because making the previously hover-only `+` visible on touch was the cheaper fix. 36px is short of the 44px guideline and is what the 56px cell allows. If admins report fat-fingering it, the answer is an add affordance in the agenda view rather than restructuring the grid.

2. **Practice cards have no Directions button.** Game cards got Call coach + Directions; practice cards got the inline weather strip only, per plan scope. A practice has a field and a coach driving to it needs directions just as much. Cheap to add — the same `mapsUrl` / `geocoords` logic already exists in `DashboardTab.tsx`.

3. **Sheets have no focus management.** `MobileNav.tsx`'s sheets set `role="dialog" aria-modal="true"` and handle Escape and backdrop-click, but do not move focus into the sheet, trap it, or restore it to the invoking button on close. Keyboard and screen-reader users can tab behind the sheet. This is the largest remaining a11y gap in the shell and pairs naturally with **Phase 2 item 3's a11y pass** (real WAI-ARIA tablist, roving tabindex, `aria-pressed` confirm, `?` disclosure).

4. **Tapping the bottom bar while the More sheet is open only closes the sheet.** The backdrop (`z-50`) covers the bar (`z-40`), so the tap lands on the backdrop. One wasted tap, not broken — but "tap Schedule while More is open" is a natural gesture.

5. **`Sheet` double-announces its title** — it sets both `aria-label={title}` and renders a visible `<h2>{title}</h2>`. `aria-labelledby` pointing at the heading would be cleaner.

## Known limits, not bugs

- **`mobileNav.test.ts`'s `NAV_ORDER` is a hand-maintained mirror** of `NAV_GROUPS` in `page.tsx`. It has to be — `NAV_GROUPS` lives inside the component body and the lib must stay runnable under `npx tsx`. A twelfth tab added to `NAV_GROUPS` but not to `NAV_ORDER` would not be caught by the test. It *would* still be invisible on desktop, which is the louder signal.

## Still unverified from Phase 0/1

- **The expired banner and tier-aware upgrade copy have never been seen.** None of the 9 lapsed accounts owns a league. To see them: take an unstarted trial, generate a schedule, then backdate `subscription_end`. The trial bar, the expired banner and the mobile trial pill all share the header region — verify them in one pass.
- **The locked-edit toast** was skipped in Phase 0 on the grounds that a persistent banner plus disabled inputs was enough. On a phone the banner scrolls away while the disabled controls stay on screen, so this is worth revisiting now that the mobile shell exists.
