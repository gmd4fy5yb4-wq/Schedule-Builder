import HelpLayout from '../HelpLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Setting up your season — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Setting up your season"
      intro="The Season Settings tab holds everything that describes your league: what it is called, when it runs, and what you play."
    >
      <h2>League name</h2>
      <p>
        This is what coaches and parents see at the top of every shared schedule. New leagues
        start out called “My League” — change it here, and the setup checklist ticks that step off.
      </p>

      <h2>Season dates</h2>
      <p>
        The start and end dates bound everything the scheduler is allowed to do. No game or
        practice will be placed outside them, so set them before you generate. You can widen
        the window later and re-generate.
      </p>

      <h2>Scheduling preferences</h2>
      <p>
        Season Settings does not include day or time preferences — there is no such setting here. Each
        division can set a preferred start time, and each team can mark which days it prefers
        to play; both live on the Auto-Schedule tab.
      </p>

      <h2>Sport and theme</h2>
      <p>
        Your sport changes the vocabulary throughout the app — “fields” become “courts” or
        “rinks”, “umpires” become “referees”. The theme sets the colours on your shared
        schedule. Both are cosmetic and safe to change at any time.
      </p>
    </HelpLayout>
  )
}
