import HelpLayout from '../HelpLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sharing with coaches — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Sharing with coaches"
      intro="Two different things can be shared, and they are not the same. Pick the wrong one and you either give away edit rights or send a link nobody can open."
    >
      <h2>The view-only link</h2>
      <p>
        This is what you send to coaches and parents. It opens the live schedule in any browser
        with no account, no password and no app. It updates automatically as you change things,
        so you never have to re-send it. Copy it with the link button in the header.
      </p>

      <h2>The league code</h2>
      <p>
        The league code is for co-administrators — someone who should be able to edit the
        schedule alongside you. Anyone with the code and an account can make changes, so treat
        it like a password and do not put it in a parent newsletter.
      </p>

      <h2>Coach notifications</h2>
      <p>
        If your teams have coach email addresses, the Coaches tab can email each coach their own
        team&rsquo;s schedule directly. Useful at the start of a season, and after any change big
        enough to be worth a message.
      </p>

      <h2>What viewers cannot see</h2>
      <p>
        View-only visitors get the schedule, standings and field information. They never see your
        setup tabs, your league code, your plan or your billing.
      </p>
    </HelpLayout>
  )
}
