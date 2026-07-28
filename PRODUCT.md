# Product

## Register

product

Split note: `/pricing` and `/login` are conversion-focused entry points (brand-adjacent), but the dashboard (`/`, all tabs) is the primary surface and sets the default register. Treat pricing/login critiques with conversion clarity in mind; treat the dashboard as a workflow tool.

## Users

Two roughly-equal user types:
- **League admins / volunteer coordinators**: desktop, heavy setup sessions — configuring divisions, fields, umpires, schedules, standings, coach notifications, billing.
- **Coaches**: mobile, lightweight checks — schedule, standings, field assignments, often glanced at outdoors or between tasks.

Job to be done: get a youth/rec sports league's season running (setup) and keep it running (schedule changes, standings, coach comms) with minimal admin overhead.

## Product Purpose

FieldDay Planner is a self-serve SaaS tool for league admins to set up and run a season — divisions, fields, umpires, auto-scheduling, standings, coach notifications — gated by a sports-based tier (Starter/Pro/Org) via Stripe. Success looks like an admin completing season setup without support intervention, and coaches trusting the schedule/standings enough to check it instead of calling the admin.

## Brand Personality

Professional, polished, trustworthy. Aspiration: Linear/Stripe-style product-tool crispness, applied to a sports-scheduling domain — confidence and clarity over sports-team theatrics. Should read as a tool worth paying $99-$399/yr for, not a free hobby project.

## Anti-references

None specified as hard constraints. General category pitfall to avoid: generic stock-admin-template blandness (noted under Design Principles below), but no specific site/app named.

## Design Principles

1. **Two audiences, one shell** — every dashboard surface should work for both a focused desktop setup session and a quick mobile glance; don't optimize purely for one.
2. **Earn the price tag** — visual and interaction polish should read as SaaS-grade (Linear/Stripe caliber), not a template default, since this is a paid product with real subscribers.
3. **Clarity over sports theatrics** — professional/trustworthy wins over athletic/loud; the navy/crimson palette can carry identity without needing bold sports-poster energy.
4. **Setup should never stall** — admins self-serve; friction in season setup (Divisions, Fields, Umpires, Schedule) directly costs support time and renewal trust.
5. **Coaches trust what they glance at** — schedule/standings must be scannable and unambiguous on mobile, since a wrong glance means a coach calls the admin instead of trusting the app.

## Accessibility & Inclusion

Standard WCAG AA: keyboard navigability, sufficient contrast (check navy `#00013a` / crimson `#cd163f` combinations, especially in the multi-theme system where leagues can swap palettes), screen-reader-sane labeling for tabs and forms. No specific colorblind mandate was raised, but standings/schedule color coding should not rely on hue alone given the theme-swapping feature.
