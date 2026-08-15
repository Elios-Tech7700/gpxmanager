const STORAGE_KEY = 'gpxmanager-strava-tokens'
const STATE_KEY = 'gpxmanager-strava-oauth-state'
const REFRESH_MARGIN_MS = 60_000

export interface StravaTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // unix seconds
}

interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
}

function toTokens(data: StravaTokenResponse): StravaTokens {
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at }
}

export function getStoredTokens(): StravaTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StravaTokens
  } catch {
    return null
  }
}

export function storeTokens(tokens: StravaTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function buildAuthorizeUrl(): string {
  // Random per-attempt state, checked on the way back in consumeOAuthState —
  // without it, a crafted callback link with someone else's ?code= would get
  // silently exchanged and attached to this browser's Strava connection.
  const state = crypto.randomUUID()
  sessionStorage.setItem(STATE_KEY, state)

  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', import.meta.env.VITE_STRAVA_CLIENT_ID ?? '')
  url.searchParams.set('redirect_uri', `${window.location.origin}/`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'activity:read_all')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('state', state)
  return url.toString()
}

// One-shot: clears the stored state whether or not it matches, so a replayed
// callback URL can't be exchanged twice.
export function consumeOAuthState(receivedState: string | null): boolean {
  const expected = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  return Boolean(expected) && expected === receivedState
}

export async function exchangeCode(code: string): Promise<StravaTokens> {
  const res = await fetch('/api/strava/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error('Échec de la connexion Strava.')
  const tokens = toTokens(await res.json())
  storeTokens(tokens)
  return tokens
}

// Concurrent callers (e.g. activities + routes lazy-loading at once with an
// expired token) share a single in-flight refresh instead of each firing
// their own — Strava's refresh_token stays valid after use, but two racing
// swaps means the second response overwrites the first's fresher pair.
let refreshInFlight: Promise<string> | null = null

export async function ensureValidToken(): Promise<string> {
  const tokens = getStoredTokens()
  if (!tokens) throw new Error('Non connecté à Strava.')
  if (tokens.expiresAt * 1000 > Date.now() + REFRESH_MARGIN_MS) return tokens.accessToken

  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    try {
      const res = await fetch('/api/strava/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      })
      if (!res.ok) throw new Error('Échec du rafraîchissement du token Strava.')
      const next = toTokens(await res.json())
      storeTokens(next)
      return next.accessToken
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

// Revokes GPX Manager's access on Strava's side, best-effort — local tokens
// get cleared by the caller regardless of whether this succeeds.
export async function deauthorize(): Promise<void> {
  const tokens = getStoredTokens()
  if (!tokens) return
  try {
    await fetch('/api/strava/deauthorize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
  } catch {
    // ignored — clearing local tokens still logs the user out of the app
  }
}
