'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const HELP_LINKS = [
  { href: '/help/setting-up-your-season', label: 'Setting up your season' },
  { href: '/help/divisions-and-teams', label: 'Divisions & teams' },
  { href: '/help/fields-and-availability', label: 'Fields & availability' },
  { href: '/help/auto-scheduling', label: 'Auto-scheduling' },
  { href: '/help/sharing-with-coaches', label: 'Sharing with coaches' },
]

export default function HelpButton({
  onStartTour, hidden,
}: { onStartTour: () => void; hidden: boolean }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Hide while a tour step is spotlighting something.
  if (hidden) return null

  return (
    // bottom-20 clears MobileNav's bottom bar; sm:bottom-6 drops back down once
    // the bar is gone. left-4 on mobile (sm:right-6 from sm up) keeps this clear
    // of the add-event FAB (right-4 bottom-24, ScheduleTab/FieldCalendarTab),
    // which this button's higher z-index would otherwise steal taps from.
    <div ref={panelRef} className="fixed bottom-20 left-4 right-auto sm:bottom-6 sm:left-auto sm:right-6 z-[8000]">
      {open && (
        <div className="absolute bottom-14 left-0 right-auto sm:left-auto sm:right-0 w-60 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Help
          </div>
          <button
            onClick={() => { setOpen(false); onStartTour() }}
            className="w-full px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-2.5 transition"
          >
            <span aria-hidden="true">▶</span> Take the tour
          </button>
          <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Help docs
          </div>
          {HELP_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-[13px] text-gray-700 hover:bg-gray-50 transition"
            >
              {l.label}
            </Link>
          ))}
          <div className="h-2" />
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Help"
        aria-expanded={open}
        className="w-12 h-12 rounded-full bg-[var(--fd-primary)] text-white text-xl font-bold shadow-lg flex items-center justify-center hover:scale-105 transition"
      >
        ?
      </button>
    </div>
  )
}
