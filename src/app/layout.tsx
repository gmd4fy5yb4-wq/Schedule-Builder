import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorker from '@/components/ServiceWorker'

export const viewport: Viewport = {
  themeColor: '#00013a',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
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
      </body>
    </html>
  )
}
