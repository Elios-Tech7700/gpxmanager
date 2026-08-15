import type { Activity, GpxPoint } from '@/types'
import { computeFingerprint } from './auto-organize'

function parseXml(text: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(text, 'application/xml')
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface RawPoint {
  lat: number
  lon: number
  ele: number
  time: Date
}

// `?? '0'` only guards a missing attribute — parseFloat('') and parseFloat of
// garbage both silently produce NaN, which we treat here as "invalid", not "zero".
function parseCoord(value: string | null | undefined): number {
  return value == null ? NaN : parseFloat(value)
}

// Missing <ele> is common (some GPX exporters omit it) and worth 0m sensible
// default; a genuinely unparseable value is not. We forward-fill NaN below
// rather than default to 0 here, so a single missing tag mid-route doesn't
// synthesize a fake climb from sea level to the next real reading.
function parseEle(text: string | null | undefined): number {
  return text ? parseFloat(text) : NaN
}

// Forward-fills NaN elevations from the nearest known previous value (0 for a
// leading run of NaNs) so `buildActivity`'s elevationGain loop never computes
// a delta against a phantom 0m baseline.
function fillMissingElevations(points: { ele: number }[]): void {
  let last = 0
  for (const p of points) {
    if (Number.isNaN(p.ele)) p.ele = last
    else last = p.ele
  }
}

// Shared by any import source (GPX file, Strava streams, ...) once it has
// reduced its own format down to a plain lat/lon/ele/time point list.
export function buildActivity(rawPoints: RawPoint[], name: string, source: Activity['source']): Activity {
  if (rawPoints.length === 0) throw new Error('Aucun point de tracé trouvé.')
  if (rawPoints.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) {
    throw new Error('Ce fichier contient des coordonnées GPS invalides.')
  }

  // Compute bearings, speeds, and track bounds in one pass
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity

  const points: GpxPoint[] = rawPoints.map((p, i) => {
    const next = rawPoints[i + 1]
    const prev = rawPoints[i - 1]
    const ref = next ?? prev
    const bearing = ref ? bearingBetween(p.lat, p.lon, ref.lat, ref.lon) : 0

    let speed = 0
    if (prev) {
      const dist = haversineDistance(prev.lat, prev.lon, p.lat, p.lon)
      const dt = (p.time.getTime() - prev.time.getTime()) / 1000
      speed = dt > 0 ? (dist / dt) * 3.6 : 0
    }

    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon

    return {
      lat: p.lat,
      lon: p.lon,
      ele: p.ele,
      time: p.time,
      bearing,
      speed,
    }
  })

  // Stats
  let distanceMeters = 0
  let elevationGain = 0
  for (let i = 1; i < points.length; i++) {
    distanceMeters += haversineDistance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
    const dEle = points[i].ele - points[i - 1].ele
    if (dEle > 0) elevationGain += dEle
  }

  const startTime = points[0].time
  const endTime = points[points.length - 1].time
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000

  const bounds: [number, number, number, number] = [minLon, minLat, maxLon, maxLat]

  return {
    id: generateId(),
    name,
    source,
    importedAt: new Date(),
    startTime,
    endTime,
    durationSeconds,
    distanceMeters,
    elevationGain,
    points,
    windFetched: false,
    bounds,
    folderId: null,
    // Set for every activity regardless of source — the auto-organize sync's
    // dedup key when there's no Strava id to compare (manual GPX uploads),
    // and a safety net even when there is one.
    fingerprint: computeFingerprint({ name, distanceMeters, points }),
  }
}

export function parseGpx(text: string, filename: string): Activity {
  const doc = parseXml(text)

  const name =
    doc.querySelector('metadata > name')?.textContent?.trim() ||
    doc.querySelector('trk > name')?.textContent?.trim() ||
    filename.replace(/\.gpx$/i, '')

  const trkpts = Array.from(doc.querySelectorAll('trkpt'))
  if (trkpts.length === 0) throw new Error('Aucun point de tracé trouvé dans ce fichier GPX.')

  const rawPoints = trkpts.map((pt) => {
    const lat = parseCoord(pt.getAttribute('lat'))
    const lon = parseCoord(pt.getAttribute('lon'))
    const ele = parseEle(pt.querySelector('ele')?.textContent)
    const timeStr = pt.querySelector('time')?.textContent ?? ''
    const parsed = timeStr ? new Date(timeStr) : null
    const time = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
    return { lat, lon, ele, time }
  })

  if (rawPoints.some((p) => !p.time)) {
    throw new Error('Ce fichier GPX ne contient pas d\'horodatage sur tous les points — le calcul du vent n\'est pas possible.')
  }
  fillMissingElevations(rawPoints)

  return buildActivity(rawPoints as RawPoint[], name, 'upload')
}

// Strava route GPX exports are planned paths, not recordings — no <time> per
// point. Synthesize a constant-pace timeline from the route's estimated moving
// time, distributed proportionally to cumulative distance (best available proxy
// for pacing, since Strava exposes no actual pace data for a route).
export function parseRouteGpx(text: string, name: string, estimatedDurationSeconds: number): Activity {
  const doc = parseXml(text)

  const trkpts = Array.from(doc.querySelectorAll('trkpt'))
  if (trkpts.length === 0) throw new Error('Aucun point de tracé trouvé dans cet itinéraire.')

  const geoPoints = trkpts.map((pt) => ({
    lat: parseCoord(pt.getAttribute('lat')),
    lon: parseCoord(pt.getAttribute('lon')),
    ele: parseEle(pt.querySelector('ele')?.textContent),
  }))
  fillMissingElevations(geoPoints)

  const cumDist = [0]
  for (let i = 1; i < geoPoints.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineDistance(geoPoints[i - 1].lat, geoPoints[i - 1].lon, geoPoints[i].lat, geoPoints[i].lon))
  }
  const totalDist = cumDist[cumDist.length - 1] || 1

  const now = new Date()
  const rawPoints: RawPoint[] = geoPoints.map((p, i) => ({
    ...p,
    time: new Date(now.getTime() + (estimatedDurationSeconds * 1000 * cumDist[i]) / totalDist),
  }))

  return buildActivity(rawPoints, name, 'strava')
}

// Reverses the route's travel direction. Distance and bounds are order-independent
// (same segments summed either way) so they're kept as-is; bearing, speed, elevation
// gain and per-point timing all depend on direction and must be recomputed. Original
// time deltas between consecutive points are preserved (in reverse) so the pacing
// profile stays intact — only the direction of travel changes.
export function reverseActivity(activity: Activity): Activity {
  const orig = activity.points
  const n = orig.length
  if (n < 2) return activity

  const deltasMs = orig.slice(1).map((p, i) => p.time.getTime() - orig[i].time.getTime())
  const reversedRaw = [...orig].reverse()

  let cumulative = 0
  const points: GpxPoint[] = reversedRaw.map((p, i) => {
    const stepMs = i > 0 ? deltasMs[n - 1 - i] : 0
    cumulative += stepMs
    const time = new Date(activity.startTime.getTime() + cumulative)

    const next = reversedRaw[i + 1]
    const prev = reversedRaw[i - 1]
    const ref = next ?? prev
    const bearing = ref ? bearingBetween(p.lat, p.lon, ref.lat, ref.lon) : 0

    let speed = 0
    if (prev && stepMs > 0) {
      const dist = haversineDistance(prev.lat, prev.lon, p.lat, p.lon)
      speed = (dist / (stepMs / 1000)) * 3.6
    }

    return { lat: p.lat, lon: p.lon, ele: p.ele, time, bearing, speed }
  })

  let elevationGain = 0
  for (let i = 1; i < points.length; i++) {
    const d = points[i].ele - points[i - 1].ele
    if (d > 0) elevationGain += d
  }

  return {
    ...activity,
    points,
    startTime: points[0].time,
    endTime: points[points.length - 1].time,
    elevationGain,
    windFetched: false,
  }
}
