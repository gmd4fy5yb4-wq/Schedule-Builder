/**
 * Guided onboarding tour. Ported from Prospect Card (softball-recruiter), with the
 * one structural change that matters: FieldDay is a single page with eleven tabs,
 * not eleven routes, so steps key on a TABS index rather than a pathname.
 *
 * That difference is why there is no TourContext here. Prospect Card needs one to
 * survive router.push() losing a race with a queued React state update; FieldDay
 * never navigates, so page.tsx holds the state directly.
 */

export type AdvanceOn = 'next-button' | 'element-click'

export interface TourStepDef {
  step: number
  tab: number          // index into TABS in src/app/page.tsx
  selector: string     // [data-tour="..."]
  title: string
  body: string
  advanceOn: AdvanceOn
}

export interface TourState {
  step: number         // 1..TOTAL_STEPS active, TOTAL_STEPS + 1 = complete
  dismissed: boolean
}

/**
 * The same arc checklistSteps() teaches in trial.ts (tabs 1, 2, 3, 8), plus the two
 * things a static checklist cannot express: what the schedule grid is for, and how
 * to share it.
 *
 * Every step uses 'next-button'. 'element-click' is supported by the type and the
 * overlay, but no step uses it: clicking "Generate Schedule" or "Add Division"
 * mid-tour has real side effects on the customer's league.
 */
export const TOUR_STEPS: TourStepDef[] = [
  {
    step: 1, tab: 0, selector: '[data-tour="checklist"]',
    title: 'Your setup checklist',
    body: 'This tracks the four things standing between you and a finished schedule. It disappears on its own once they are done.',
    advanceOn: 'next-button',
  },
  {
    step: 2, tab: 1, selector: '[data-tour="league-name"]',
    title: 'Name your league',
    body: 'Give it the name coaches and parents will recognise, then set the season start and end dates just below.',
    advanceOn: 'next-button',
  },
  {
    step: 3, tab: 2, selector: '[data-tour="add-division"]',
    title: 'Add divisions and teams',
    body: 'Majors, Minors, T-Ball — whatever you call them. Each division needs at least two teams before it can be scheduled.',
    advanceOn: 'next-button',
  },
  {
    step: 4, tab: 3, selector: '[data-tour="add-field"]',
    title: 'Add your fields',
    body: 'Every place a game or practice can happen. Blackout dates live here too, so the scheduler knows when a field is unavailable.',
    advanceOn: 'next-button',
  },
  {
    step: 5, tab: 8, selector: '[data-tour="generate-schedule"]',
    title: 'Generate the season',
    body: 'This builds the whole season at once, conflict-free, and starts your 14-day trial. Nothing is charged — the clock simply begins here rather than at signup.',
    advanceOn: 'next-button',
  },
  {
    step: 6, tab: 5, selector: '[data-tour="schedule-grid"]',
    title: 'Adjust anything',
    body: 'Every game is editable after it is generated. Conflicts are flagged live, so you can move things without breaking the season.',
    advanceOn: 'next-button',
  },
  {
    step: 7, tab: 0, selector: '[data-tour="share-link"]',
    title: 'Share it',
    body: 'Copy the view-only link and send it to coaches and parents. They see the live schedule and never need an account.',
    advanceOn: 'next-button',
  },
]

export const TOTAL_STEPS = TOUR_STEPS.length

/**
 * The step to render right now, or null. Returns null when the user is on a
 * different tab — the step is suppressed rather than skipped, so it comes back
 * if they navigate back.
 */
export function getActiveStep(state: TourState | null, tab: number): TourStepDef | null {
  if (!state || state.dismissed) return null
  const def = TOUR_STEPS.find(s => s.step === state.step)
  if (!def) return null            // covers the complete sentinel
  if (def.tab !== tab) return null
  return def
}

/** Advance one step, clamping at the complete sentinel. */
export function advanceTour(state: TourState): TourState {
  if (state.step > TOTAL_STEPS) return state
  return { ...state, step: state.step + 1 }
}
