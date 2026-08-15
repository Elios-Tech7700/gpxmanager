import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const r = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
      headers: { Authorization: `Bearer ${req.query.access_token}` },
    })
    res.status(r.status).json(await r.json())
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erreur serveur' })
  }
}
