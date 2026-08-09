import type { VercelRequest, VercelResponse } from '@vercel/node'
import { tokenRequest } from '../_lib/strava-server.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const data = await tokenRequest({ refresh_token: req.body.refresh_token, grant_type: 'refresh_token' })
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erreur serveur' })
  }
}
