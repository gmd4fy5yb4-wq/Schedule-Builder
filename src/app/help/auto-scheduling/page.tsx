import HelpLayout from '../HelpLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Auto-scheduling — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Auto-scheduling"
      intro="Auto-Schedule builds your entire season in one pass — every division, every team, every field — without double-booking anything."
    >
      <h2>Before you generate</h2>
      <p>The generate button stays disabled until three things are true:</p>
      <ul>
        <li>Your season has a start date and an end date.</li>
        <li>At least one division has two or more teams. A division with one team has nobody to play.</li>
        <li>At least one field exists.</li>
      </ul>

      <h2>What it does</h2>
      <p>
        The scheduler builds a round-robin matchup list for each division, then finds the
        best available slot for every game based on your fields, your playing days and times,
        and any blackout dates you have set. It never places two games on the same field at
        the same time.
      </p>

      <h2>This starts your 14-day trial</h2>
      <p>
        Your trial clock begins the first time you generate a schedule — not when you sign up.
        That is deliberate: if you set your league up in the off-season, you should not burn
        the trial before you have seen the product do anything. Nothing is charged when the
        clock starts, and you keep full access for the whole fourteen days.
      </p>

      <h2>After it runs</h2>
      <p>
        Everything is editable. Open the Schedule tab and drag games to new slots — conflicts
        are flagged live as you move things, so you cannot accidentally break the season.
        Re-running Auto-Schedule replaces the generated schedule, so make manual edits after
        you are happy with the generated one.
      </p>
    </HelpLayout>
  )
}
