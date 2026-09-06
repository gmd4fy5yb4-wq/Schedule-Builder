import type { Metadata, Viewport } from 'next'
import { siteUrl } from '@/lib/siteUrl'
import './globals.css'
import ServiceWorker from '@/components/ServiceWorker'

export const viewport: Viewport = {
  themeColor: '#00013a',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  // Makes the root opengraph-image (and any relative og/canonical URL) absolute.
  metadataBase: new URL(siteUrl('https://fielddayplanner.app')),
  title: 'FieldDay Planner',
  description: 'Schedule any sport, any league',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FieldDay Planner',
  },
  formatDetection: { telephone: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-gray-50 min-h-screen">
        <ServiceWorker />
        {children}
        {/* Bottom padding clears MobileNav's fixed bar (min-h-[56px] + safe area,
            sm:hidden) so the mark is not covered on phones. */}
        <footer className="border-t border-gray-200 px-4 pt-3 pb-[calc(56px+env(safe-area-inset-bottom))] sm:pb-3 text-center text-xs text-gray-500">
          An{' '}
          <a
            href="https://www.alfred-digital.com/sports"
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2 hover:text-gray-700"
          >
            Alfred Digital Sports
          </a>{' '}
          product
        </footer>
      </body>
    </html>
  )
}
