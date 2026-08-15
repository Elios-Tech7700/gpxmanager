export async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    // Spread body FIRST so client_id/client_secret always win — this function
    // is safe by construction even if a future caller passes those keys in body.
    body: JSON.stringify({
      ...body,
      client_id: process.env.VITE_STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`Strava token error ${res.status}: ${detail}`)
    throw new Error('Erreur lors de la communication avec Strava.')
  }
  return res.json()
}
