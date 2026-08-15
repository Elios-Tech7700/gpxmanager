import type { VercelRequest, VercelResponse } from '@vercel/node'
import { tokenRequest } from '../_lib/strava-server.js'
import { isTrustedOrigin } from '../_lib/origin-guard.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isTrustedOrigin(req)) return res.status(403).json({ error: 'Origine non autorisée' })
  if (typeof req.body?.code !== 'string' || !req.body.code) {
    return res.status(400).json({ error: 'Requête invalide' })
  }
  try {
    const data = await tokenRequest({ code: req.body.code, grant_type: 'authorization_code' })
    res.status(200).json(data)
  } catch (e) {
    console.error('Strava exchange error:', e)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}
