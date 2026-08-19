'use client'
import { useEffect } from 'react'

interface TourWelcomeModalProps {
  onAccept: () => void
  onDecline: () => void
}

export default function TourWelcomeModal({ onAccept, onDecline }: TourWelcomeModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDecline()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDecline])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-welcome-title"
      onClick={onDecline}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        zIndex: 9000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: '40px 36px',
          maxWidth: 440, width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 20 }} aria-hidden="true">🏟️</div>
        <h2
          id="tour-welcome-title"
          style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 10px', letterSpacing: '-0.02em' }}
        >
          Want a quick tour?
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.7, margin: '0 0 28px' }}>
          We&rsquo;ll show you how to get your season on the field — about 2 minutes.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onAccept}
            style={{
              width: '100%', padding: '13px 24px',
              background: 'var(--fd-primary)', color: '#fff', border: 'none',
              borderRadius: 9, fontSize: 14, fontWeight: 700,
              letterSpacing: '0.06em', cursor: 'pointer',
            }}
          >
            YES, SHOW ME
          </button>
          <button
            type="button"
            onClick={onDecline}
            style={{
              width: '100%', padding: '11px 24px',
              background: 'none', border: '1px solid #e2e8f0',
              borderRadius: 9, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#64748b',
            }}
          >
            I&rsquo;ll explore on my own
          </button>
        </div>
      </div>
    </div>
  )
}
