/** @type {import('next').NextConfig} */
const nextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        // Prevent clickjacking — page must not be embedded in an iframe on another origin
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },

        // Block MIME-type sniffing
        { key: 'X-Content-Type-Options', value: 'nosniff' },

        // Force HTTPS for 1 year, include subdomains
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },

        // Disable referrer for cross-origin requests
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

        // Restrict browser APIs (camera, mic, geolocation not needed)
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },

        // Content Security Policy
        // - Supabase for API/auth/realtime
        // - Resend not needed client-side (server-only)
        // - Open-Meteo for weather (fetched client-side from weather.ts)
        // - Stripe.js for payment UI
        // - Google Maps redirect links (navigated to, not fetched)
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            // Scripts: self + Next.js inline chunks + Stripe
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
            // Styles: self + Tailwind inline styles
            "style-src 'self' 'unsafe-inline'",
            // Images: self + data URIs (for export canvas) + Supabase storage
            `img-src 'self' data: blob: https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '') ?? ''}`,
            // Fonts: self
            "font-src 'self'",
            // API calls: self + Supabase + Open-Meteo + Stripe
            `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://api.stripe.com`,
            // Stripe payment iframe
            "frame-src https://js.stripe.com https://hooks.stripe.com",
            // Service worker
            "worker-src 'self' blob:",
            // Forms only submit to self
            "form-action 'self'",
            // Only allow HTTPS resources
            "upgrade-insecure-requests",
          ].join('; '),
        },
      ],
    },
  ],
}

module.exports = nextConfig
