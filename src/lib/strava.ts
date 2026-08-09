import type { Activity } from '@/types'
import { buildActivity } from './gpx-parser'
import { ensureValidToken } from './strava-auth'

const BIKE_TYPES = new Set(['Ride', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'VirtualRide'])

export interface StravaActivitySummary {
  id: string
  name: string
  startDate: string
  distanceMeters: number
  type: string
}

interface StravaActivityApiItem {
  id_str: string
  name: string
  start_date: string
  distance: number
  type: string
}

interface StravaStreamsResponse {
  latlng?: { data: [number, number][] }
  altitude?: { data: number[] }
  time?: { data: number[] }
}

export async function fetchStravaActivities(): Promise<StravaActivitySummary[]> {
  const token = await ensureValidToken()
  const res = await fetch(`/api/strava/activities?access_token=${token}`)
  if (!res.ok) throw new Error('Impossible de récupérer les activités Strava.')
  const data: StravaActivityApiItem[] = await res.json()
  return data
    .filter((a) => BIKE_TYPES.has(a.type))
    .map((a) => ({ id: a.id_str, name: a.name, startDate: a.start_date, distanceMeters: a.distance, type: a.type }))
}

export async function importStravaActivity(summary: StravaActivitySummary): Promise<Activity> {
  const token = await ensureValidToken()
  const res = await fetch(`/api/strava/activities/${summary.id}/streams?access_token=${token}`)
  if (!res.ok) throw new Error('Impossible de récupérer le tracé de cette activité.')
  const streams: StravaStreamsResponse = await res.json()

  const latlng = streams.latlng?.data ?? []
  if (!latlng.length) throw new Error('Cette activité Strava ne contient pas de trace GPS.')
  const altitude = streams.altitude?.data ?? []
  const time = streams.time?.data ?? []

  // Strava's time stream is relative (seconds since start), not absolute timestamps
  const startDate = new Date(summary.startDate)
  const rawPoints = latlng.map(([lat, lon], i) => ({
    lat,
    lon,
    ele: altitude[i] ?? 0,
    time: new Date(startDate.getTime() + (time[i] ?? 0) * 1000),
  }))

  return buildActivity(rawPoints, summary.name, 'strava')
}
