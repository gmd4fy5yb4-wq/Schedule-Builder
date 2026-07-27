'use client'
import { useEffect } from 'react'

export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(err => console.warn('SW registration failed:', err))
    } else {
      // In development the SW's cache-first handling of /_next/static/ serves
      // stale chunks across rebuilds, breaking styling and hydration. Make dev
      // self-healing: tear down any previously-registered SW and its caches.
      navigator.serviceWorker
        .getRegistrations()
        .then(regs => regs.forEach(r => r.unregister()))
        .catch(() => {})
      if (typeof caches !== 'undefined') {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {})
      }
    }
  }, [])
  return null
}
