import HelpLayout from '../HelpLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Divisions & teams — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Divisions & teams"
      intro="A division is a group of teams that play each other. Most leagues split by age — 6U, 8U Minors, 10U Majors — but any grouping works."
    >
      <h2>Why two teams is the minimum</h2>
      <p>
        A division with one team in it has nobody to play, so the scheduler skips it entirely
        and the setup checklist does not count it as done. Add the second team and it starts
        scheduling immediately.
      </p>

      <h2>Teams</h2>
      <p>
        Add teams inside the division they belong to. Each team can carry a coach name and
        contact details, which is what the Coaches tab and the coach notification emails use.
      </p>

      <h2>Divisions never mix</h2>
      <p>
        The scheduler only ever pairs teams within the same division, so a 6U team will never
        be scheduled against a 12U team. If you want two age groups to play each other, put
        them in the same division.
      </p>

      <h2>How many you can have</h2>
      <p>
        Your plan sets the limits on divisions and teams. The Setup tab shows your current
        usage against those limits, and the app tells you before you hit one rather than after.
      </p>
    </HelpLayout>
  )
}
