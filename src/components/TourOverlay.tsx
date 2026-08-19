'use client'
import { useEffect, useRef, useState } from 'react'
import type { TourStepDef } from '@/lib/tour'

interface Rect { top: number; left: number; width: number; height: number }

function findVisibleElement(selector: string): Element | null {
  const matches = document.querySelectorAll(selector)
  for (const el of Array.from(matches)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

interface TourOverlayProps {
  step: TourStepDef
  stepNumber: number
  totalSteps: number
  onNext: () => void
  onDismiss: () => void
}

const PAD = 8
const TOOLTIP_W = 280
const TOOLTIP_MARGIN = 12
const TOOLTIP_H_ESTIMATE = 150

export default function TourOverlay({
  step, stepNumber, totalSteps, onNext, onDismiss,
}: TourOverlayProps) {
  // null = still measuring, 'missing' = target genuinely not on screen.
  const [rect, setRect] = useState<Rect | null | 'missing'>(null)
  const onNextRef = useRef(onNext)
  useEffect(() => { onNextRef.current = onNext }, [onNext])

  useEffect(() => { setRect(null) }, [step.selector])

  useEffect(() => {
    let raf = 0
    function measure() {
      const el = findVisibleElement(step.selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }

    measure()

    // The target may not be painted yet on the frame a tab switch happens, so give
    // it one frame before declaring it missing. Without this the fallback would
    // fire on every step transition.
    raf = requestAnimationFrame(() => {
      if (!findVisibleElement(step.selector)) setRect('missing')
      else measure()
    })

    const el = findVisibleElement(step.selector)
    const ro = new ResizeObserver(measure)
    if (el) ro.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    let removeClick: (() => void) | null = null
    if (step.advanceOn === 'element-click' && el) {
      const handler = () => onNextRef.current()
      el.addEventListener('click', handler)
      removeClick = () => el.removeEventListener('click', handler)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      removeClick?.()
    }
  }, [step.selector, step.advanceOn])

  if (rect === null) return null   // measuring

  // ── Fallback: target is genuinely off-screen ───────────────────────────────
  // On mobile the desktop tab bar is hidden and several tabs live behind
  // MobileNav's "More" sheet, so the target may not exist in the DOM at all.
  // Prospect Card's overlay renders nothing in that case, which makes the tour
  // silently vanish mid-run with no error and no recovery. A step that teaches
  // but does not point is strictly better than a dead tour.
  //
  // Also covers a returning user replaying the tour: step 1 targets
  // FirstRunChecklist, which return-nulls once all four steps are done.
  // Compare `rect` inline rather than through an `isMissing` boolean — narrowing a
  // union through an aliased condition is version-dependent, and this must compile.
  const hl = rect === 'missing' ? null : {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  }
  const isMissing = hl === null

  let tipTop: number
  let tipLeft: number
  if (hl) {
    tipLeft = Math.max(TOOLTIP_MARGIN, Math.min(hl.left, window.innerWidth - TOOLTIP_W - TOOLTIP_MARGIN))
    const below = hl.top + hl.height + TOOLTIP_MARGIN
    const above = hl.top - TOOLTIP_H_ESTIMATE - TOOLTIP_MARGIN
    tipTop = below + TOOLTIP_H_ESTIMATE > window.innerHeight ? above : below
  } else {
    tipLeft = Math.max(TOOLTIP_MARGIN, (window.innerWidth - TOOLTIP_W) / 2)
    tipTop = Math.max(TOOLTIP_MARGIN, (window.innerHeight - TOOLTIP_H_ESTIMATE) / 2)
  }

  // With no element to click, an element-click step can only advance via Next.
  const advanceOn = isMissing ? 'next-button' : step.advanceOn

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: isMissing ? 'rgba(0,0,0,0.65)' : 'transparent',
          pointerEvents: advanceOn === 'element-click' ? 'none' : 'auto',
        }}
      />

      {hl && (
        <div
          style={{
            position: 'fixed',
            top: hl.top, left: hl.left, width: hl.width, height: hl.height,
            zIndex: 9001, borderRadius: 8, pointerEvents: 'none',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            outline: '2px solid var(--fd-accent)', outlineOffset: 1,
          }}
        />
      )}

      <div
        role="dialog"
        aria-live="polite"
        aria-label={`Tour step ${stepNumber} of ${totalSteps}: ${step.title}`}
        style={{
          position: 'fixed', top: tipTop, left: tipLeft,
          width: TOOLTIP_W, zIndex: 9002,
          background: '#fff', borderRadius: 12, padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          border: '1px solid #e2e8f0',
        }}
      >
        <p style={{
          margin: '0 0 4px', fontSize: 10, fontWeight: 700,
          color: 'var(--fd-accent)', letterSpacing: '.1em', textTransform: 'uppercase',
        }}>
          Step {stepNumber} of {totalSteps}
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          {step.title}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
          {step.body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={onDismiss}
            style={{
              fontSize: 12, color: '#94a3b8', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            Skip tour
          </button>
          {advanceOn === 'next-button' ? (
            <button
              onClick={onNext}
              style={{
                padding: '8px 18px', background: 'var(--fd-primary)', color: '#fff',
                border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '.04em',
              }}
            >
              {stepNumber === totalSteps ? 'DONE' : 'NEXT →'}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
              Tap the highlighted control ↑
            </span>
          )}
        </div>
      </div>
    </>
  )
}
