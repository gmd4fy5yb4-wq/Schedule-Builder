import Link from 'next/link'

/* The logged-out front door at `/`. Server-rendered on purpose: it is the page
   that gets crawled, pasted into a league board's group chat, and read by
   someone who has never seen the app — none of which should have to wait on the
   993-line client bundle behind it.

   Every number here is load-bearing and must match `src/lib/plans.ts`. The
   trial sentence is the one people get wrong: the clock starts on the FIRST
   SAVE OF A SCHEDULE WITH ANYTHING ON IT (a hand-added practice counts), never
   "when you generate a schedule" — see CLAUDE.md. */

const STEPS = [
  {
    n: '1',
    title: 'Set up your season',
    body: 'Name the league, set the dates, add your divisions and fields. Import teams from a spreadsheet with CSV, or type them in. FieldDay speaks your sport — innings, halves or periods.',
  },
  {
    n: '2',
    title: 'Auto-schedule it',
    body: 'One click builds the whole season: home and away balanced, field time shared out, rest days respected, double-bookings caught before anyone sees them. Don’t like a week? Change it, and undo if you change your mind.',
  },
  {
    n: '3',
    title: 'Send one link',
    body: 'Coaches and parents open a read-only link — live schedule, standings and field maps on any phone. Move a rained-out game and their copy updates itself. Nobody signs up for anything.',
  },
]

const TIERS = [
  { name: 'Starter', annual: 99, season: 39, limits: '1 sport · 3 divisions · 24 teams', fits: false },
  { name: 'Pro', annual: 199, season: 69, limits: '3 sports · 10 divisions · 100 teams', fits: true },
  { name: 'Org', annual: 399, season: 129, limits: 'Unlimited sports, divisions and teams', fits: false },
]

const QUESTIONS = [
  {
    q: 'When does the free trial actually start?',
    a: 'The 14 days begin the first time you save a schedule with something on it — a generated season, or a single hand-added practice. Setting up your league and looking around costs you nothing.',
  },
  {
    q: 'What happens when it ends?',
    a: 'Your league goes view-only. Nothing is deleted and every share link keeps working, so coaches and parents never see a broken season. Pick a plan whenever you’re ready — even next spring.',
  },
  {
    q: 'Do coaches and parents need accounts?',
    a: 'No. One read-only link shows the live schedule, standings and field maps on any phone. Only the person running the league signs in, and that is with an emailed 8-digit code — there is no password to forget.',
  },
  {
    q: 'Can someone help me run it?',
    a: 'Yes. Share your league’s 6-character code and another admin can edit alongside you. The league stays on your plan, so there is nothing extra to buy.',
  },
]

/* The product, shown rather than described: the month grid from ScheduleTab,
   which is the view the app opens on. Everything here mirrors that component —
   the gray-50 month bar, the uppercase day headers, the date circle (filled
   navy for today), division-coloured chips carrying a two-letter division badge
   so they are not distinguishable by hue alone, gray practice chips, and
   red-tinted blackout days marked "closed". If ScheduleTab's chips or palette
   change, change them here too: this picture is a claim about the product. */

type Chip = { time: string; badge: string; label: string; tone: 'blue' | 'purple' | 'practice' }

const CHIP_TONE: Record<Chip['tone'], string> = {
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  purple: 'bg-purple-50 text-purple-800 border-purple-200',
  practice: 'bg-gray-100 text-gray-600 border-gray-200',
}

const GAME = (time: string, label: string, tone: 'blue' | 'purple'): Chip => ({
  time,
  badge: tone === 'blue' ? 'MI' : 'MA',
  label,
  tone,
})
const PRACTICE = (time: string, team: string): Chip => ({
  time,
  badge: 'MI',
  label: `${team} practice`,
  tone: 'practice',
})

/* April 2027 — the 1st is a Thursday, so the grid opens with four blanks. */
const FIRST_DOW = 4
const DAYS_IN_MONTH = 30
const TODAY = 12
const BLACKOUT = new Set([16])

const EVENTS: Record<number, Chip[]> = {
  3: [GAME('9:00 AM', 'Comets vs Riptide', 'blue'), GAME('11:00 AM', 'Bandits vs Foxes', 'purple')],
  7: [PRACTICE('5:30 PM', 'Comets')],
  10: [GAME('9:00 AM', 'Sluggers vs Comets', 'blue'), GAME('1:00 PM', 'Meteors vs Bandits', 'purple')],
  14: [PRACTICE('5:30 PM', 'Riptide')],
  17: [GAME('9:00 AM', 'Riptide vs Bandits', 'blue'), GAME('11:00 AM', 'Foxes vs Meteors', 'purple')],
  21: [PRACTICE('5:30 PM', 'Sluggers')],
  24: [GAME('9:00 AM', 'Comets vs Meteors', 'blue'), GAME('11:00 AM', 'Bandits vs Sluggers', 'purple')],
}

function ScheduleProof() {
  const cells: (number | null)[] = [
    ...Array.from({ length: FIRST_DOW }, () => null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-white rounded-lg border shadow-lg overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
        <span className="text-gray-600 text-lg leading-none">‹</span>
        <h3 className="font-semibold text-gray-800 flex-1 text-center text-[15px]">April 2027</h3>
        <span className="text-gray-600 text-lg leading-none">›</span>
        <span className="text-xs text-[var(--fd-primary)] border border-[var(--fd-primary)] rounded-lg px-2 py-1">
          Today
        </span>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b bg-gray-50">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-[10px] sm:text-xs font-semibold text-gray-500 py-1.5 sm:py-2 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const col = i % 7
          const edge = col < 6 ? 'border-r' : ''
          if (day === null) {
            return <div key={`b${i}`} className={`min-h-[74px] sm:min-h-[104px] bg-gray-50 border-b ${edge}`} />
          }
          const isBlackout = BLACKOUT.has(day)
          const events = EVENTS[day] ?? []
          return (
            <div key={day} className={`min-h-[74px] sm:min-h-[104px] border-b p-1 sm:p-1.5 flex flex-col ${edge} ${isBlackout ? 'bg-red-50' : ''}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={`text-[10px] sm:text-xs font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${
                    day === TODAY
                      ? 'bg-[var(--fd-primary)] text-white'
                      : isBlackout
                        ? 'text-red-400'
                        : 'text-gray-600'
                  }`}
                >
                  {day}
                </span>
                {isBlackout && <span className="text-[10px] text-red-300 italic pr-0.5">closed</span>}
              </div>
              {/* Below sm the app swaps chips for a crimson count badge — the cells
                  are a date picker at that width, not a readable schedule. */}
              {events.length > 0 && (
                <span className="sm:hidden mx-auto mb-1 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--fd-accent)] text-white text-[11px] font-bold">
                  {events.length}
                </span>
              )}
              <div className="hidden sm:block space-y-0.5">
                {events.map(ev => (
                  <div
                    key={ev.time + ev.label}
                    className={`text-[9px] sm:text-[11px] leading-tight px-1 sm:px-1.5 py-0.5 rounded-lg truncate border ${CHIP_TONE[ev.tone]}`}
                  >
                    <span className="font-medium">{ev.time}</span>{' '}
                    <span className="inline-block align-baseline mr-0.5 px-1 rounded bg-black/10 text-[8px] font-bold tracking-wide">
                      {ev.badge}
                    </span>
                    {ev.label}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="bg-gray-50">
      {/* ── Nav + hero, one navy block ─────────────────────────────────────── */}
      <div className="bg-[var(--fd-primary)]">
        <header className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="w-[34px] h-[34px] rounded-lg bg-white text-[var(--fd-primary)] font-bold text-[15px] flex items-center justify-center">
              FD
            </span>
            <span className="text-white text-lg font-semibold">FieldDay Planner</span>
          </div>
          <nav className="flex items-center gap-5 sm:gap-7">
            <Link href="/pricing" className="hidden sm:inline text-[var(--fd-primary-light)] text-[15px] hover:text-white transition">
              Pricing
            </Link>
            <Link href="/help" className="hidden sm:inline text-[var(--fd-primary-light)] text-[15px] hover:text-white transition">
              Help
            </Link>
            <Link href="/login" className="text-white text-[15px] font-medium hover:opacity-80 transition">
              Sign in
            </Link>
            <Link
              href="/login"
              className="px-4 py-2.5 rounded-[10px] bg-[var(--fd-accent)] text-white text-[15px] font-semibold hover:bg-[var(--fd-accent-hover)] transition"
            >
              Start free
            </Link>
          </nav>
        </header>

        <section className="max-w-6xl mx-auto px-6 pt-12 pb-16 sm:pt-16 sm:pb-24">
          <div className="max-w-3xl">
            <p className="text-[var(--fd-primary-muted)] text-xs font-semibold uppercase tracking-[0.12em] mb-5">
              Youth &amp; rec league scheduling
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.6rem] font-bold text-white leading-[1.05] mb-5 text-balance">
              Your whole season, scheduled in an afternoon.
            </h1>
            <p className="text-lg text-[var(--fd-primary-light)] leading-relaxed mb-8 max-w-[32em]">
              FieldDay builds a balanced, conflict-free schedule for every division you run — then keeps
              coaches and parents looking at the same live copy of it, on one link, all season.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="px-7 py-3.5 rounded-xl bg-[var(--fd-accent)] text-white text-[17px] font-semibold hover:bg-[var(--fd-accent-hover)] transition"
              >
                Start free — create your league
              </Link>
              <span className="text-[var(--fd-primary-light)] text-[15px]">
                or{' '}
                <Link href="/pricing" className="text-white underline underline-offset-2">
                  see plans
                </Link>
              </span>
            </div>
            <p className="text-sm text-[var(--fd-primary-muted)] mt-5">
              14 days free · No credit card · Takes about 2 minutes
            </p>
          </div>
        </section>
      </div>

      {/* The app itself, straddling the fold — full content width, because that is
          the width the month grid needs before its chips start truncating. */}
      <div className="max-w-6xl mx-auto px-6 -mt-12 sm:-mt-16 relative">
        <ScheduleProof />
        <p className="text-center text-sm text-gray-500 mt-4">
          One month of a 10U softball season: two divisions, weekend games, midweek practices,
          and a field closure the scheduler worked around.
        </p>
      </div>

      {/* ── The wedge ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-y border-gray-200 mt-16">
        <ul className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[15px] text-gray-700">
          {['No per-team fees', 'No transaction cuts', 'No sales call', 'Coaches and parents never need an account'].map(w => (
            <li key={w} className="flex items-center gap-2">
              <span className="text-emerald-700" aria-hidden="true">✓</span>
              {w}
            </li>
          ))}
        </ul>
      </div>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20">
        <p className="text-[var(--fd-accent)] text-xs font-semibold uppercase tracking-[0.12em] mb-3">How it works</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2.5">Three steps, one afternoon</h2>
        <p className="text-[17px] text-gray-600 max-w-[60ch] leading-relaxed mb-10">
          You bring the teams and the field time. FieldDay does the part that takes a weekend on a spreadsheet.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map(s => (
            <div key={s.n} className="bg-white border border-gray-200 rounded-xl shadow-sm p-7">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--fd-primary)] text-white text-[15px] font-semibold mb-4">
                {s.n}
              </span>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{s.title}</h3>
              <p className="text-[15px] text-gray-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Saturday it rains ──────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-18">
        <div className="bg-[var(--fd-primary)] rounded-2xl p-8 sm:p-11 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          <div>
            <p className="text-[var(--fd-primary-muted)] text-xs font-semibold uppercase tracking-[0.12em] mb-3.5">
              The Saturday it rains
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3.5">
              One change. Everyone already knows.
            </h2>
            <p className="text-base text-[var(--fd-primary-light)] leading-relaxed max-w-[42ch]">
              Move a game and the share link every coach and parent already has updates itself — no new
              PDF, no group text, no &ldquo;which version is this?&rdquo; And if you want it in writing,
              FieldDay emails the coaches for you.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-xl px-4 py-4 flex items-center justify-between gap-4">
              <div>
                <span className="block text-sm font-semibold text-gray-900">Comets v Riptide</span>
                <span className="block text-xs text-gray-500">Sat 9:00 · Veterans 1</span>
              </div>
              <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                Postponed
              </span>
            </div>
            <div className="bg-white rounded-xl px-4 py-4 flex items-center justify-between gap-4">
              <div>
                <span className="block text-sm font-semibold text-gray-900">Comets v Riptide</span>
                <span className="block text-xs text-gray-500">Sun 1:00 · Lincoln Park</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                Rescheduled
              </span>
            </div>
            <span className="text-[13px] text-[var(--fd-primary-muted)] pl-1">Coaches notified · Share link live</span>
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20">
        <p className="text-[var(--fd-accent)] text-xs font-semibold uppercase tracking-[0.12em] mb-3">Pricing</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2.5">Priced per league, not per player</h2>
        <p className="text-[17px] text-gray-600 max-w-[62ch] leading-relaxed mb-9">
          Run one season a year? Take the 3-month pass — a one-time payment with no auto-renew. Run
          year-round? Annual costs less than two seasons.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {TIERS.map(t => (
            <div
              key={t.name}
              className={`bg-white rounded-xl p-6 ${
                t.fits
                  ? 'border-2 border-[var(--fd-primary)] shadow-lg'
                  : 'border border-gray-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h3 className="text-lg font-bold text-gray-900">{t.name}</h3>
                {t.fits && (
                  <span className="text-[11px] font-semibold text-white bg-[var(--fd-primary)] px-2.5 py-0.5 rounded-full">
                    Most leagues
                  </span>
                )}
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-[2rem] font-bold text-gray-900">${t.annual}</span>
                <span className="text-sm text-gray-500 mb-1.5">/year</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 mb-4">or ${t.season} for a 3-month season pass</p>
              <p className="text-sm text-gray-700">{t.limits}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-500 mt-5">
          Every plan includes auto-scheduling, share links, standings, coach emails, per-field weather,
          CSV import, snapshots and undo.{' '}
          <Link href="/pricing" className="underline underline-offset-2 text-gray-600">
            Compare the plans
          </Link>
          .
        </p>
      </section>

      {/* ── Objections ─────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-18">
        <h2 className="text-2xl sm:text-[1.75rem] font-bold text-gray-900 mb-7">Before you start</h2>
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
          {QUESTIONS.map(o => (
            <div key={o.q}>
              <h3 className="text-[17px] font-semibold text-gray-900 mb-1.5">{o.q}</h3>
              <p className="text-[15px] text-gray-600 leading-relaxed">{o.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-18 pb-20">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 sm:p-11 text-center">
          <h2 className="text-3xl sm:text-[2.1rem] font-bold text-gray-900 mb-3">Scheduling a season?</h2>
          <p className="text-[17px] text-gray-600 mb-7">
            Set up your league in an afternoon and see the whole thing before you pay anything.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3.5 rounded-xl bg-[var(--fd-accent)] text-white text-[17px] font-semibold hover:bg-[var(--fd-accent-hover)] transition"
          >
            Start free — create your league
          </Link>
          <p className="text-sm text-gray-500 mt-5">
            14 days free · No credit card · Already have an account?{' '}
            <Link href="/login" className="underline underline-offset-2 text-gray-600">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
