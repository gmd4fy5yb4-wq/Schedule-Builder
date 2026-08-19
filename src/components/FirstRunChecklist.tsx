'use client'
import type { AppState } from '@/lib/types'
import { checklistSteps } from '@/lib/trial'
import Icon from './Icon'

/**
 * Four steps to a first schedule. Derived entirely from the league blob — nothing
 * is persisted and there is no dismiss control: finishing step 4 is the dismissal.
 */
export default function FirstRunChecklist({
  state,
  onNavigate,
}: {
  state: AppState
  onNavigate: (tab: number) => void
}) {
  const steps = checklistSteps(state)
  if (steps.every(s => s.done)) return null

  const nextIndex = steps.findIndex(s => !s.done)
  const doneCount = steps.filter(s => s.done).length

  return (
    <section data-tour="checklist" className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-lg font-semibold text-gray-900">Let&rsquo;s get your season on the field</h2>
        <span className="text-xs font-medium text-gray-500">{doneCount} of {steps.length} done</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Four steps to your first schedule — most leagues finish in under 30 minutes.
      </p>

      <ol className="space-y-2">
        {steps.map((step, i) => {
          // Only the next incomplete step gets the CTA — a wall of four buttons
          // is a menu, not a checklist.
          const isNext = i === nextIndex
          return (
            <li
              key={step.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isNext ? 'bg-[var(--fd-primary)]/5 ring-1 ring-[var(--fd-primary)]/20' : ''}`}
            >
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.done ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}
                aria-hidden="true"
              >
                {step.done ? <Icon name="check" className="w-3.5 h-3.5" /> : i + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${step.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {step.label}
                </span>
                {!step.done && <span className="block text-xs text-gray-500">{step.detail}</span>}
              </span>

              <span className="sr-only">{step.done ? 'Done' : 'Not done yet'}</span>

              {isNext && (
                <button
                  onClick={() => onNavigate(step.tab)}
                  className="shrink-0 text-xs font-semibold bg-[var(--fd-accent)] hover:bg-[var(--fd-accent-hover)] text-white rounded-lg px-3 py-1.5 transition"
                >
                  {step.cta} →
                </button>
              )}
            </li>
          )
        })}
      </ol>

      <p className="text-xs text-gray-500 mt-4">
        Then share a view-only link — coaches and parents see the live schedule, no account needed.
      </p>
    </section>
  )
}
