import HelpLayout from '../HelpLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Setting up your season — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Setting up your season"
      intro="The Setup tab holds everything that describes your league: what it is called, when it runs, and what you play."
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

      <h2>Playing days and times</h2>
      <p>
        Tell FieldDay which days of the week you play and the time slots available on each.
        The scheduler only ever places games in these windows — this is the main lever for
        keeping weeknight games off a field your league cannot use on a Tuesday.
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
