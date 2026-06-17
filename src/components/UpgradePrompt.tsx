interface Props {
  limitType: 'divisions' | 'teams' | 'leagues' | 'sports'
  planName: string
}

const LABELS: Record<Props['limitType'], string> = {
  leagues: 'league', divisions: 'division', teams: 'team', sports: 'sport',
}

export default function UpgradePrompt({ limitType, planName }: Props) {
  const label = LABELS[limitType]

  return (
    <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-amber-900">
          {planName} plan {label} limit reached
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Upgrade your plan to add more {limitType}.
        </p>
      </div>
      <a
        href="/pricing"
        className="shrink-0 text-xs font-semibold text-amber-900 underline hover:text-amber-700 whitespace-nowrap"
      >
        Upgrade plan →
      </a>
    </div>
  )
}
