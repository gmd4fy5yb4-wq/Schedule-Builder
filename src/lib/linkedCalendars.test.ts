// Standalone assert-based check (no framework). Run: npx tsx src/lib/linkedCalendars.test.ts
import assert from 'node:assert'
import { extractViewToken } from './linkedCalendars'

const UUID = '3a2a880c-1234-4abc-89ab-b7b6fade6fb1'

// full share link
assert.equal(extractViewToken(`https://fielddayplanner.app/?token=${UUID}`), UUID, 'full URL')
assert.equal(extractViewToken(`https://fielddayplanner.app/?token=${UUID}&view=readonly`), UUID, 'URL with extra params')
// bare token
assert.equal(extractViewToken(UUID), UUID, 'bare token')
assert.equal(extractViewToken(`  ${UUID.toUpperCase()}  `), UUID, 'uppercase + whitespace → normalized')
// junk
assert.equal(extractViewToken('not a link'), null, 'no token')
assert.equal(extractViewToken('https://fielddayplanner.app/'), null, 'link without token')

console.log('linkedCalendars: all checks passed')
