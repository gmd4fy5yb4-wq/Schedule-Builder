// Standalone assert-based check (no framework, matches plans.test.ts convention).
// Run: npx tsx src/lib/siteUrl.test.ts
import assert from 'node:assert'
import { siteUrl } from './siteUrl'

// The actual production failure: NEXT_PUBLIC_SITE_URL was pasted into Vercel with a
// trailing newline, so Stripe rejected success_url with `url_invalid`.
process.env.NEXT_PUBLIC_SITE_URL = 'https://fielddayplanner.app\n'
assert.equal(siteUrl(), 'https://fielddayplanner.app')
assert.doesNotThrow(() => new URL(`${siteUrl()}/checkout/success`))

process.env.NEXT_PUBLIC_SITE_URL = 'https://fielddayplanner.app/'
assert.equal(siteUrl(), 'https://fielddayplanner.app')

delete process.env.NEXT_PUBLIC_SITE_URL
assert.equal(siteUrl(), 'http://localhost:3000')

console.log('siteUrl: all checks passed')
