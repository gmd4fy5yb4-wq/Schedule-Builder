import { ImageResponse } from 'next/og'
import { iconJsx } from '@/lib/iconJsx'
import { PLANS } from '@/lib/plans'

// The card that unfurls when a fielddayplanner.app link is pasted into a text
// thread, a league email or a Facebook group. Declared at the app root so every
// route inherits it; `metadataBase` in layout.tsx makes the URL absolute.
//
// Generated, not drawn: the price reads from src/lib/plans.ts the same way
// /pricing does, so the picture cannot outlive a price change. Satori supports
// flexbox only, and every element with more than one child needs display:flex.

export const alt = 'FieldDay Planner — your whole season, scheduled in an afternoon'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const NAVY = '#00013a'
const RED = '#cd163f'
const MIST = '#c7c9ff'

export default function OpengraphImage() {
  const starter = PLANS.find((p) => p.tier === 'starter')!
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundColor: NAVY,
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 16, overflow: 'hidden' }}>{iconJsx(72)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 22 }}>
            <span style={{ fontSize: 30, fontWeight: 700 }}>FieldDay Planner</span>
            <span style={{ fontSize: 20, letterSpacing: 4, color: MIST }}>ALFRED DIGITAL SPORTS</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.06,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Your whole season,</span>
            <span>scheduled in an afternoon.</span>
          </div>
          <div style={{ width: 120, height: 8, backgroundColor: RED, borderRadius: 4, marginTop: 28, display: 'flex' }} />
          <div style={{ marginTop: 24, fontSize: 30, lineHeight: 1.4, color: MIST }}>
            Balanced, conflict-free schedules for youth &amp; rec leagues. Coaches and parents read one live link.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 26, color: MIST }}>fielddayplanner.app</span>
          <span style={{ fontSize: 26, fontWeight: 600 }}>
            Free for 14 days · Starter from ${starter.seasonPassPriceUsd} a season
          </span>
        </div>
      </div>
    ),
    size,
  )
}
