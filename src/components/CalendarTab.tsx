'use client'
import { useState } from 'react'
import type { AppState } from '@/lib/types'
import { getSportConfig } from '@/lib/sports'
import ScheduleTab from './ScheduleTab'
import TeamScheduleTab from './TeamScheduleTab'
import FieldCalendarTab from './FieldCalendarTab'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; readOnly?: boolean }

type Scope = 'all' | 'team' | 'venue'

/**
 * One Calendar tab over the three panes that used to be three nav tabs
 * (Schedule / Team Schedules / <Venue> Calendar). They were never separate
 * features — they are the same events filtered three ways — so the choice
 * belongs inside the tab, not in the top nav.
 *
 * The panes keep their own state and are rendered, not lifted: this file owns
 * the scope switch and nothing else.
 *
 * "Show" vocabulary is deliberately unlike ScheduleTab's own
 * Calendar/Day/List control, which sits a few pixels away — two segmented
 * controls reading as siblings is exactly the confusion this tab is fixing.
 */
export default function CalendarTab({ state, setState, readOnly = false }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [scope, setScope] = useState<Scope>('all')

  const scopes: { id: Scope; label: string }[] = [
    { id: 'all', label: 'Whole league' },
    { id: 'team', label: 'One team' },
    { id: 'venue', label: `One ${sc.venueSingular.toLowerCase()}` },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span id="calendar-scope-label" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Show
        </span>
        <div role="group" aria-labelledby="calendar-scope-label" className="flex rounded-lg border overflow-hidden text-sm bg-white">
          {scopes.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              aria-pressed={scope === s.id}
              className={`min-h-[44px] sm:min-h-0 px-4 sm:py-1.5 transition whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fd-primary)] ${i > 0 ? 'border-l' : ''} ${
                scope === s.id ? 'bg-[var(--fd-primary)] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {scope === 'all' && <ScheduleTab state={state} setState={setState} readOnly={readOnly} />}
      {scope === 'team' && <TeamScheduleTab state={state} setState={setState} readOnly={readOnly} />}
      {scope === 'venue' && <FieldCalendarTab state={state} setState={setState} readOnly={readOnly} />}
    </div>
  )
}
