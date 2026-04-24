// Shared color palette for divisions — assigned by position in the divisions array
// so colors stay consistent as long as order doesn't change, and support any number of divisions

const PALETTE = [
  { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200',   pill: 'bg-blue-100 text-blue-700',   header: 'bg-blue-600',   accent: 'border-blue-400' },
  { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', pill: 'bg-purple-100 text-purple-700', header: 'bg-purple-600', accent: 'border-purple-400' },
  { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200',  pill: 'bg-amber-100 text-amber-700',  header: 'bg-amber-500',  accent: 'border-amber-400' },
  { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200',    pill: 'bg-red-100 text-red-700',    header: 'bg-red-600',    accent: 'border-red-400' },
  { bg: 'bg-[#f5f5fb]',  text: 'text-[var(--fd-accent)]', border: 'border-[#eeeef6]', pill: 'bg-[#eeeef6] text-[var(--fd-accent)]', header: 'bg-[var(--fd-primary)]', accent: 'border-[var(--fd-accent)]' },
  { bg: 'bg-teal-50',   text: 'text-teal-800',   border: 'border-teal-200',   pill: 'bg-teal-100 text-teal-700',   header: 'bg-teal-600',   accent: 'border-teal-400' },
  { bg: 'bg-pink-50',   text: 'text-pink-800',   border: 'border-pink-200',   pill: 'bg-pink-100 text-pink-700',   header: 'bg-pink-600',   accent: 'border-pink-400' },
  { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', pill: 'bg-indigo-100 text-indigo-700', header: 'bg-indigo-600', accent: 'border-indigo-400' },
  { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', pill: 'bg-orange-100 text-orange-700', header: 'bg-orange-500', accent: 'border-orange-400' },
  { bg: 'bg-cyan-50',   text: 'text-cyan-800',   border: 'border-cyan-200',   pill: 'bg-cyan-100 text-cyan-700',   header: 'bg-cyan-600',   accent: 'border-cyan-400' },
]

// Bright green — applied to any division whose name contains "travel" (case-insensitive)
const TRAVEL_COLOR = {
  bg: 'bg-green-100', text: 'text-green-900', border: 'border-green-400',
  pill: 'bg-green-200 text-green-900', header: 'bg-green-500', accent: 'border-green-500',
}

const DEFAULT_COLOR = PALETTE[0]

export function getDivisionColor(divisionId: string, allDivisions: { id: string; name?: string }[]) {
  const div = allDivisions.find(d => d.id === divisionId)
  if (div?.name && /travel/i.test(div.name)) return TRAVEL_COLOR
  const index = allDivisions.findIndex(d => d.id === divisionId)
  if (index === -1) return DEFAULT_COLOR
  return PALETTE[index % PALETTE.length]
}
