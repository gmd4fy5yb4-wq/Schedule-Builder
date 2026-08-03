// ponytail: trim() exists because a pasted NEXT_PUBLIC_SITE_URL carried a trailing
// newline into Vercel Production, and Stripe rejected success_url with url_invalid.
// Whitespace, not the trailing slash, is what the old .replace(/\/$/,'') missed.
export function siteUrl(fallback = 'http://localhost:3000'): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? fallback).trim().replace(/\/$/, '')
}
