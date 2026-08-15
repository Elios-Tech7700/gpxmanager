import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' })
  if (!/^\d+$/.test(String(req.query.id))) return res.status(400).json({ error: 'Identifiant invalide' })
  try {
    const r = await fetch(
      `https://www.strava.com/api/v3/activities/${req.query.id}/streams?keys=latlng,altitude,time&key_by_type=true`,
      { headers: { Authorization: auth }, signal: AbortSignal.timeout(10_000) },
    )
    res.status(r.status).json(await r.json())
  } catch (e) {
    console.error('Strava streams fetch error:', e)
    res.status(502).json({ error: 'Erreur lors de la communication avec Strava.' })
  }
}
