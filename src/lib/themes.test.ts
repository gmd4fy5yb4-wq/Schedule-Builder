// Standalone assert-based check (no framework). Run: npx tsx src/lib/themes.test.ts
//
// Finding 17: a new theme must not be mergeable with a failing contrast pair.
// Ratios are WCAG 2.1 relative luminance — the same formula the design review's
// checker used, kept here so themes.ts is the only thing that can break it.
import assert from 'node:assert'
import { THEMES } from './themes'

const hex2rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

function luminance(hex: string): number {
  const [r, g, b] = hex2rgb(hex).map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// Known-good anchors from the WCAG spec — proves the formula itself, not just the themes.
assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00', 'black/white = 21:1')
assert.equal(contrastRatio('#ffffff', '#ffffff').toFixed(2), '1.00', 'white/white = 1:1')
assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48', 'mid gray/white = 4.48:1')

const AA = 4.5   // normal text
const WHITE = '#ffffff'

for (const t of THEMES) {
  // Every pair is normal-size text somewhere in the app (header meta at 12px,
  // links on white), so all four are held to 4.5:1 — not the 3:1 large-text bar.
  const pairs: [string, string, string][] = [
    ['primaryLight on primary', t.primaryLight, t.primary],
    ['primaryMuted on primary', t.primaryMuted, t.primary],
    ['white on accent',         WHITE,          t.accent],
    ['accent on white',         t.accent,       WHITE],
    ['white on accentHover',    WHITE,          t.accentHover],
  ]
  for (const [label, fg, bg] of pairs) {
    const r = contrastRatio(fg, bg)
    assert.ok(r >= AA, `${t.id}: ${label} is ${r.toFixed(2)}:1, needs ${AA}:1 (${fg} on ${bg})`)
  }
  // Hover must be darker than rest, or the button reads as broken on hover.
  assert.ok(
    luminance(t.accentHover) < luminance(t.accent),
    `${t.id}: accentHover ${t.accentHover} is not darker than accent ${t.accent}`
  )
}

console.log(`✓ themes: ${THEMES.length} themes × 5 pairs pass AA 4.5:1`)
