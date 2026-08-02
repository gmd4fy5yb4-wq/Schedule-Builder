// Shared color palette for divisions — assigned by position in the divisions array
// so colors stay consistent as long as order doesn't change, and support any number of divisions

const PALETTE = [
  { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200',   pill: 'bg-blue-100 text-blue-700',   header: 'bg-blue-600',   accent: 'border-blue-400' },
  { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', pill: 'bg-purple-100 text-purple-700', header: 'bg-purple-600', accent: 'border-purple-400' },
  { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200',  pill: 'bg-amber-100 text-amber-700',  header: 'bg-amber-500',  accent: 'border-amber-400' },
  { bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-200',    pill: 'bg-red-100 text-red-700',    header: 'bg-red-600',    accent: 'border-red-400' },
  { bg: 'bg-violet-50',  text: 'text-violet-800', border: 'border-violet-200', pill: 'bg-violet-100 text-violet-700', header: 'bg-violet-600', accent: 'border-violet-400' },
  { bg: 'bg-teal-50',   text: 'text-teal-800',   border: 'border-teal-200',   pill: 'bg-teal-100 text-teal-700',   header: 'bg-teal-600',   accent: 'border-teal-400' },
  { bg: 'bg-pink-50',   text: 'text-pink-800',   border: 'border-pink-200',   pill: 'bg-pink-100 text-pink-700',   header: 'bg-pink-600',   accent: 'border-pink-400' },
  { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', pill: 'bg-indigo-100 text-indigo-700', header: 'bg-indigo-600', accent: 'border-indigo-400' },
  { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', pill: 'bg-orange-100 text-orange-700', header: 'bg-orange-500', accent: 'border-orange-400' },
  { bg: 'bg-cyan-50',   text: 'text-cyan-800',   border: 'border-cyan-200',   pill: 'bg-cyan-100 text-cyan-700',   header: 'bg-cyan-600',   accent: 'border-cyan-400' },
]

const DEFAULT_COLOR = PALETTE[0]

export function getDivisionColor(divisionId: string, allDivisions: { id: string; name?: string }[]) {
  const index = allDivisions.findIndex(d => d.id === divisionId)
  if (index === -1) return DEFAULT_COLOR
  return PALETTE[index % PALETTE.length]
}

/**
 * A two-character badge for a division, so month-grid chips are not
 * distinguishable by hue alone (finding 16 — roughly 8% of men have a
 * colour-vision deficiency, and the six-theme system multiplies the risk).
 *
 * Prefers the initials of the first two words ("10U Minors" -> "1M",
 * "Majors" -> "MA"), falling back to the first two characters. Always
 * uppercase, always exactly two characters when there is anything to work
 * with, so the badges align in a column of chips.
 */
export function divisionInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
