import type { Activity, WindApiResponse } from '@/types'

function centroid(bounds: Activity['bounds']): [string, string] {
  const [minLon, minLat, maxLon, maxLat] = bounds
  return [((minLat + maxLat) / 2).toFixed(4), ((minLon + maxLon) / 2).toFixed(4)]
}

// The `hourly`/`daily` params below are requested with timezone=UTC, so the
// start_date/end_date bounds must be UTC calendar days too — date-fns'
// `format` reads the local timezone, which silently shifts the requested
// range by a day for any user west/east of UTC and starves the edges of the
// activity's actual time window.
function toUTCDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const FETCH_TIMEOUT_MS = 10_000

// The comparator can fire several of these concurrently (one per compared route),
// which occasionally trips Open-Meteo's burst rate limit (429) even well under its
// documented daily quota. Retry transient errors (429 + 5xx) with a short backoff
// instead of surfacing them straight to the user — a real outage still fails after this.
async function fetchJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    const retryAfter = Number(res.headers.get('retry-after'))
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt)
    return fetchJson<T>(url, attempt + 1)
  }
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)
  return res.json()
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

  const data = await fetchJson<WindApiResponse>(url.toString())

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
  const startDate = toUTCDateString(activity.startTime)
  const endDate = toUTCDateString(activity.endTime)
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
  const startDate = toUTCDateString(new Date())
  const endDate = toUTCDateString(new Date(Date.now() + days * 86400000))

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat)
  url.searchParams.set('longitude', lon)
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', endDate)
  url.searchParams.set('hourly', 'wind_speed_10m,wind_direction_10m')
  url.searchParams.set('daily', 'sunrise,sunset')
  url.searchParams.set('windspeed_unit', 'kmh')
  url.searchParams.set('timezone', 'UTC')

  const data = await fetchJson<ForecastApiResponse>(url.toString())

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

// Interpolate wind at a specific timestamp from hourly data. Timestamps outside
// the fetched range are clamped to the nearest edge rather than extrapolated —
// linearly projecting a single hourly reading across days of missing data would
// produce a number that looks precise but isn't grounded in any real forecast.
export function interpolateWind(
  timestamp: Date,
  windData: { time: Date; speed: number; direction: number }[],
): { speed: number; direction: number } {
  if (windData.length === 0) throw new Error('Aucune donnée de vent disponible pour cette période.')

  const ms = timestamp.getTime()
  const first = windData[0]
  const last = windData[windData.length - 1]

  if (ms <= first.time.getTime()) return { speed: first.speed, direction: first.direction }
  if (ms >= last.time.getTime()) return { speed: last.speed, direction: last.direction }

  let before = first
  let after = last

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
