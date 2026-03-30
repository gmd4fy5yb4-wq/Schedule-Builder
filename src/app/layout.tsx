import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Softball Scheduler',
  description: 'League scheduling tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
