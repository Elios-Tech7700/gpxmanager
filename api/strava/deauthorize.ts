import type { VercelRequest, VercelResponse } from '@vercel/node'

// Called before clearing local tokens on "Déconnecter" — without this, the
// app forgets the token but Strava still considers GPX Manager an authorized
// app on the athlete's account.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' })
  try {
    await fetch('https://www.strava.com/oauth/deauthorize', {
      method: 'POST',
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    })
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Strava deauthorize error:', e)
    res.status(502).json({ error: 'Erreur lors de la révocation Strava.' })
  }
}
