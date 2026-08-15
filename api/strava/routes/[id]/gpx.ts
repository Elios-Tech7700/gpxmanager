import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' })
  if (!/^\d+$/.test(String(req.query.id))) return res.status(400).json({ error: 'Identifiant invalide' })
  try {
    const r = await fetch(`https://www.strava.com/api/v3/routes/${req.query.id}/export_gpx`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    })
    const text = await r.text()
    res
      .status(r.status)
      .setHeader('Content-Type', 'application/gpx+xml')
      // Third-party XML served from our own origin — nosniff blocks a browser
      // from ever reinterpreting it as HTML, and forcing a download (rather
      // than inline render) removes any reason for it to be sniffed at all.
      .setHeader('X-Content-Type-Options', 'nosniff')
      .setHeader('Content-Disposition', 'attachment; filename="route.gpx"')
      .send(text)
  } catch (e) {
    console.error('Strava GPX export error:', e)
    res.status(502).json({ error: 'Erreur lors de la communication avec Strava.' })
  }
}
