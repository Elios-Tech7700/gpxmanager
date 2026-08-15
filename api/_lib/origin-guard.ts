import type { VercelRequest } from '@vercel/node'

// Best-effort CSRF backstop for the two unauthenticated endpoints (exchange,
// refresh) that can't require a bearer token — they're the ones that ISSUE it.
// Not a substitute for real rate limiting, just rejects requests whose
// Origin/Referer isn't one of ours before they reach Strava.
const ALLOWED_HOSTS = new Set(
  [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    'gpxmanager.vercel.app',
    'localhost:5173',
    'localhost:3000',
  ].filter((h): h is string => Boolean(h)),
)

export function isTrustedOrigin(req: VercelRequest): boolean {
  const header = req.headers.origin ?? req.headers.referer
  if (!header) return false
  try {
    return ALLOWED_HOSTS.has(new URL(header).host)
  } catch {
    return false
  }
}
