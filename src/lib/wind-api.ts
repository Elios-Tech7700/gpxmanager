import type { Activity, WindApiResponse } from '@/types'
import { format } from 'date-fns'

function centroid(bounds: Activity['bounds']): [string, string] {
  const [minLon, minLat, maxLon, maxLat] = bounds
  return [((minLat + maxLat) / 2).toFixed(4), ((minLon + maxLon) / 2).toFixed(4)]
}

async function fetchWindRange(
  lat: string,
  lon: string,
  startDate: string,
  endDate: string,
): Promise<{ time: Date; speed: number; direction: number }[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat)
  url.searchParams.set('longitude', lon)
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', endDate)
  url.searchParams.set('hourly', 'wind_speed_10m,wind_direction_10m')
  url.searchParams.set('windspeed_unit', 'kmh')
  url.searchParams.set('timezone', 'UTC')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)

  const data: WindApiResponse = await res.json()

  return data.hourly.time.map((t, i) => ({
    time: new Date(t + ':00Z'),
    speed: data.hourly.wind_speed_10m[i],
    direction: data.hourly.wind_direction_10m[i],
  }))
}

// Forecast endpoint covers ~92 past days through 16 future days — enough range
// for planning an upcoming ride. One call covers the full activity time range
// at the route centroid.
export async function fetchWindForActivity(activity: Activity): Promise<{ time: Date; speed: number; direction: number }[]> {
  const [lat, lon] = centroid(activity.bounds)
  const startDate = format(activity.startTime, 'yyyy-MM-dd')
  const endDate = format(activity.endTime, 'yyyy-MM-dd')
  return fetchWindRange(lat, lon, startDate, endDate)
}

export interface DaylightWindow {
  date: string // yyyy-MM-dd
  sunrise: Date
  sunset: Date
}

interface ForecastApiResponse extends WindApiResponse {
  daily: {
    time: string[]
    sunrise: string[]
    sunset: string[]
  }
}

// Wide forecast window (default 7 days from now) at the route centroid, independent
// of the ride's own duration — used to browse upcoming wind before picking a departure.
// Also returns real sunrise/sunset per day (same request, `daily` param) so slot
// suggestions can be restricted to daylight hours instead of proposing a ride at 22h.
export async function fetchWindForecast(
  activity: Activity,
  days = 7,
): Promise<{ hours: { time: Date; speed: number; direction: number }[]; daylight: DaylightWindow[] }> {
  const [lat, lon] = centroid(activity.bounds)
  const startDate = format(new Date(), 'yyyy-MM-dd')
  const endDate = format(new Date(Date.now() + days * 86400000), 'yyyy-MM-dd')

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat)
  url.searchParams.set('longitude', lon)
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', endDate)
  url.searchParams.set('hourly', 'wind_speed_10m,wind_direction_10m')
  url.searchParams.set('daily', 'sunrise,sunset')
  url.searchParams.set('windspeed_unit', 'kmh')
  url.searchParams.set('timezone', 'UTC')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)

  const data: ForecastApiResponse = await res.json()

  const hours = data.hourly.time.map((t, i) => ({
    time: new Date(t + ':00Z'),
    speed: data.hourly.wind_speed_10m[i],
    direction: data.hourly.wind_direction_10m[i],
  }))

  const daylight = data.daily.time.map((d, i) => ({
    date: d,
    sunrise: new Date(data.daily.sunrise[i] + ':00Z'),
    sunset: new Date(data.daily.sunset[i] + ':00Z'),
  }))

  return { hours, daylight }
}

// Interpolate wind at a specific timestamp from hourly data
export function interpolateWind(
  timestamp: Date,
  windData: { time: Date; speed: number; direction: number }[],
): { speed: number; direction: number } {
  const ms = timestamp.getTime()

  // Find surrounding hours
  let before = windData[0]
  let after = windData[windData.length - 1]

  for (let i = 0; i < windData.length - 1; i++) {
    if (windData[i].time.getTime() <= ms && windData[i + 1].time.getTime() >= ms) {
      before = windData[i]
      after = windData[i + 1]
      break
    }
  }

  const range = after.time.getTime() - before.time.getTime()
  if (range === 0) return { speed: before.speed, direction: before.direction }

  const t = (ms - before.time.getTime()) / range

  // Interpolate speed linearly
  const speed = before.speed + t * (after.speed - before.speed)

  // Interpolate direction circularly
  let dDir = after.direction - before.direction
  if (dDir > 180) dDir -= 360
  if (dDir < -180) dDir += 360
  const direction = (before.direction + t * dDir + 360) % 360

  return { speed, direction }
}
