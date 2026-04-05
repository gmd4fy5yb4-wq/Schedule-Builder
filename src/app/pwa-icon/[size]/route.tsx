import { ImageResponse } from 'next/og'
import { iconJsx } from '@/lib/iconJsx'

export const runtime = 'edge'

export async function GET(
  _req: Request,
  context: { params: Promise<{ size: string }> }
) {
  const { size: sizeStr } = await context.params
  const size = Math.min(512, Math.max(16, parseInt(sizeStr) || 192))

  return new ImageResponse(iconJsx(size), {
    width: size,
    height: size,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
