import HelpLayout from '../HelpLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Fields & availability — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Fields & availability"
      intro="Fields are the physical places a game or practice can happen. The scheduler treats each one as a resource that can only hold one event at a time."
    >
      <h2>Adding a field</h2>
      <p>
        Give it the name your league actually uses — “Diamond 2”, “North Field” — because that
        is the name coaches and parents will read on the shared schedule. An address is optional
        but powers the map link on the shared view.
      </p>

      <h2>Blackout dates</h2>
      <p>
        Blackouts are not set on this tab. League-wide blackouts — a date nothing can be
        scheduled anywhere — are set on the Season Settings tab. Per-field blackouts — a single field
        closed for a tournament, maintenance, or a school using the site — are set on the
        Auto-Schedule tab&rsquo;s first step. Either way, a blackout is a single date, not a
        range; add one entry per date. The scheduler routes around them automatically, so you
        do not have to fix the schedule afterwards.
      </p>

      <h2>More fields means a tighter season</h2>
      <p>
        Fields are usually the binding constraint. If the scheduler cannot fit your season into
        the date range, the first thing to check is whether you have enough field time — either
        add a field or widen the season window.
      </p>

      <h2>The field calendar</h2>
      <p>
        Once a schedule exists, the Calendar tab’s “One field” view shows one field at a time, one month at
        a time, with buttons to step to the previous or next month. The event count shown next
        to the field covers the whole season even though the grid itself only shows a month.
      </p>
    </HelpLayout>
  )
}
