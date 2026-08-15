import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' })
  try {
    const r = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    })
    res.status(r.status).json(await r.json())
  } catch (e) {
    console.error('Strava activities fetch error:', e)
    res.status(502).json({ error: 'Erreur lors de la communication avec Strava.' })
  }
}
