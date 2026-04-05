import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FieldDay Planner',
    short_name: 'FieldDay',
    description: 'Schedule any sport, any league',
    start_url: '/',
    display: 'standalone',
    background_color: '#00013a',
    theme_color: '#00013a',
    orientation: 'portrait',
    categories: ['sports', 'productivity'],
    icons: [
      {
        src: '/pwa-icon/192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
