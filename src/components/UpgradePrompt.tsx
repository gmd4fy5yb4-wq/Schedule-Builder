interface Props {
  limitType: 'divisions' | 'teams' | 'leagues' | 'sports'
  /** The plan the user is ON — not the one they'd need to buy. */
  planName: string
  /** The tier the user is ON. 'trial' switches the copy. */
  planTier?: string
  /** The plan they'd need to buy, when it differs from the one they're on. */
  neededPlanName?: string
}

const LABELS: Record<Props['limitType'], string> = {
  leagues: 'league', divisions: 'division', teams: 'team', sports: 'sport',
}

export default function UpgradePrompt({ limitType, planName, planTier, neededPlanName }: Props) {
  const label = LABELS[limitType]
  const onTrial = planTier === 'trial'

  // Trial users are not paying customers. Telling them a paid plan's "limit is
  // reached" reads as if they already bought it (finding D).
  const title = onTrial
    ? `Free trial ${label} limit reached`
    : `${planName} plan ${label} limit reached`
  const body = onTrial
    ? neededPlanName
      ? `Adding more ${limitType} needs the ${neededPlanName} plan. Nothing you have built goes away — pick a plan when you are ready.`
      : `Pick a plan to add more ${limitType}. Nothing you have built goes away.`
    : neededPlanName
      ? `Upgrade to ${neededPlanName} to add more ${limitType}.`
      : `Upgrade your plan to add more ${limitType}.`

  return (
    <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-amber-900">{title}</p>
        <p className="text-xs text-amber-700 mt-0.5">{body}</p>
      </div>
      <a
        href="/pricing"
        className="shrink-0 text-xs font-semibold text-amber-900 underline hover:text-amber-700 whitespace-nowrap"
      >
        {onTrial ? 'See plans →' : 'Upgrade plan →'}
      </a>
    </div>
  )
}
