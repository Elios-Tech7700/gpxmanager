import type { Activity } from '@/types'
import { parseRouteGpx } from './gpx-parser'
import { ensureValidToken } from './strava-auth'
import { buildStravaId } from './auto-organize'

const PAGE_SIZE = 200
const MAX_PAGES = 20

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
  const all: StravaRouteApiItem[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`/api/strava/routes?page=${page}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('Impossible de récupérer les itinéraires Strava.')
    const data: StravaRouteApiItem[] = await res.json()
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all.map((r) => ({
    id: r.id_str,
    name: r.name,
    distanceMeters: r.distance,
    elevationGain: r.elevation_gain,
    estimatedMovingTime: r.estimated_moving_time,
  }))
}

export async function importStravaRoute(summary: StravaRouteSummary): Promise<Activity> {
  const token = await ensureValidToken()
  const res = await fetch(`/api/strava/routes/${summary.id}/gpx`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Impossible de récupérer le tracé de cet itinéraire.')
  const text = await res.text()
  const activity = parseRouteGpx(text, summary.name, summary.estimatedMovingTime)
  return { ...activity, stravaId: buildStravaId('route', summary.id) }
}
