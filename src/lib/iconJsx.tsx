/** Shared icon JSX for next/og ImageResponse — used by app/icon.tsx, apple-icon.tsx, and icon routes */
export function iconJsx(size: number) {
  const fontSize = Math.round(size * 0.36)
  const barW    = Math.round(size * 0.42)
  const barH    = Math.max(3, Math.round(size * 0.06))
  const barMt   = Math.round(size * 0.08)
  const radius  = Math.round(size * 0.02)

  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#00013a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          color: 'white',
          fontSize,
          fontWeight: 900,
          fontFamily: '"Arial Black", Helvetica, Arial, sans-serif',
          letterSpacing: '-1px',
          lineHeight: '1',
        }}
      >
        FD
      </div>
      <div
        style={{
          width: barW,
          height: barH,
          background: '#cd163f',
          borderRadius: radius,
          marginTop: barMt,
        }}
      />
    </div>
  )
}
