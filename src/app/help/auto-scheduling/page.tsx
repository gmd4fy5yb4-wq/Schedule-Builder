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
      <p>The generate button stays disabled until your season has a start date, an end date, and at least one field.</p>
      <p>
        That is the whole gate — but a division still needs two or more teams to actually
        produce games. A division with one team is not blocked from generating, it is just
        skipped: it has nobody to play.
      </p>

      <h2>What it does</h2>
      <p>
        The scheduler builds a round-robin matchup list for each division, then finds the
        best available slot for every game. Fields are open 8 AM&ndash;8 PM every day; the
        scheduler tries a fixed set of start times, favouring each division&rsquo;s preferred
        start time and each team&rsquo;s preferred days when you have set them, and it routes
        around any blackout dates. It never places two games on the same field at the same
        time.
      </p>

      <h2>This starts your 14-day trial</h2>
      <p>
        Your trial clock begins the first time you save a schedule with anything on it —
        whether Auto-Schedule generated it, or you added a single game, practice, or event by
        hand — not when you sign up. That is deliberate: if you set your league up in the
        off-season, you should not burn the trial before you have seen the product do anything.
        Nothing is charged when the clock starts, and you keep full access for the whole
        fourteen days.
      </p>

      <h2>After it runs</h2>
      <p>
        Generating never touches your live schedule by itself — it builds a preview. Review it,
        then choose to append the new games to what you already have or replace your existing
        games with the preview; nothing changes until you commit one of those. Once committed,
        everything is editable: open the Calendar tab and drag games to new slots — conflicts
        are flagged live as you move things, so you cannot accidentally break the season.
      </p>
    </HelpLayout>
  )
}
