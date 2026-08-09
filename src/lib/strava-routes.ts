import type { Activity } from '@/types'
import { parseRouteGpx } from './gpx-parser'
import { ensureValidToken } from './strava-auth'

export interface StravaRouteSummary {
  id: string
  name: string
  distanceMeters: number
  elevationGain: number
  estimatedMovingTime: number
}

interface StravaRouteApiItem {
  id_str: string
  name: string
  distance: number
  elevation_gain: number
  estimated_moving_time: number
}

export async function fetchStravaRoutes(): Promise<StravaRouteSummary[]> {
  const token = await ensureValidToken()
  const res = await fetch(`/api/strava/routes?access_token=${token}`)
  if (!res.ok) throw new Error('Impossible de récupérer les itinéraires Strava.')
  const data: StravaRouteApiItem[] = await res.json()
  return data.map((r) => ({
    id: r.id_str,
    name: r.name,
    distanceMeters: r.distance,
    elevationGain: r.elevation_gain,
    estimatedMovingTime: r.estimated_moving_time,
  }))
}

export async function importStravaRoute(summary: StravaRouteSummary): Promise<Activity> {
  const token = await ensureValidToken()
  const res = await fetch(`/api/strava/routes/${summary.id}/gpx?access_token=${token}`)
  if (!res.ok) throw new Error('Impossible de récupérer le tracé de cet itinéraire.')
  const text = await res.text()
  return parseRouteGpx(text, summary.name, summary.estimatedMovingTime)
}
