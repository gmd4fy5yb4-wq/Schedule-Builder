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
        A blackout marks a date, or a range, when a field cannot be used: tournaments,
        maintenance, a school using the site. The scheduler routes around blackouts
        automatically, so you do not have to fix the schedule afterwards.
      </p>

      <h2>More fields means a tighter season</h2>
      <p>
        Fields are usually the binding constraint. If the scheduler cannot fit your season into
        the date range, the first thing to check is whether you have enough field time — either
        add a field, add playing days, or widen the season window.
      </p>

      <h2>The field calendar</h2>
      <p>
        Once a schedule exists, the Field Calendar tab shows one field at a time across the
        whole season. It is the fastest way to spot a field that is over- or under-used.
      </p>
    </HelpLayout>
  )
}
