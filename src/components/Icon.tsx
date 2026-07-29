/**
 * The app's icon set (finding 13: emoji rendered as UI chrome look different on
 * every OS, don't take a theme colour, and read as clip-art next to real controls).
 *
 * ponytail: nine hand-written 24×24 strokes instead of an icon dependency. The
 * design handoff assumed lucide-react was already installed — it is not, and a
 * whole package for nine glyphs is not worth the install. Add lucide the day this
 * map passes ~25 icons; the call signature below is deliberately lucide-shaped so
 * that swap is a find-replace.
 *
 * Icons inherit currentColor and are aria-hidden — every one of them sits next to
 * real text, so they are decorative. If one ever stands alone, give it a title.
 */
const PATHS: Record<string, React.ReactNode> = {
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
  droplet: <path d="M12 2.7 6.9 8.4a7 7 0 1 0 10.2 0Z" />,
  wind: <><path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.7 4.4A2.5 2.5 0 1 1 19.5 8.7H2" /><path d="M9.6 15.3A2 2 0 1 0 11 12H2" /></>,
  star: <path d="m12 3 2.9 5.8 6.4.9-4.6 4.5 1 6.4-5.7-3-5.7 3 1-6.4L2.7 9.7l6.4-.9Z" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
}

export type IconName = keyof typeof PATHS

export default function Icon({ name, className = 'w-4 h-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
