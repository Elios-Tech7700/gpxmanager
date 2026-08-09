const STORAGE_KEY = 'gpxmanager-strava-tokens'
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
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', import.meta.env.VITE_STRAVA_CLIENT_ID ?? '')
  url.searchParams.set('redirect_uri', `${window.location.origin}/`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'activity:read_all')
  url.searchParams.set('approval_prompt', 'auto')
  return url.toString()
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

export async function ensureValidToken(): Promise<string> {
  const tokens = getStoredTokens()
  if (!tokens) throw new Error('Non connecté à Strava.')
  if (tokens.expiresAt * 1000 > Date.now() + REFRESH_MARGIN_MS) return tokens.accessToken

  const res = await fetch('/api/strava/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
  })
  if (!res.ok) throw new Error('Échec du rafraîchissement du token Strava.')
  const next = toTokens(await res.json())
  storeTokens(next)
  return next.accessToken
}
