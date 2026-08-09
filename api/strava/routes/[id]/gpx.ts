import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const r = await fetch(`https://www.strava.com/api/v3/routes/${req.query.id}/export_gpx`, {
      headers: { Authorization: `Bearer ${req.query.access_token}` },
    })
    const text = await r.text()
    res.status(r.status).setHeader('Content-Type', 'application/gpx+xml').send(text)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erreur serveur' })
  }
}
