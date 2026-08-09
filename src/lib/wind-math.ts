import type { Activity, GpxPoint, WindRelative, WindClass } from '@/types'
import { fetchWindForActivity, interpolateWind } from './wind-api'
import { shiftActivityStart } from './schedule'

// Wind direction (met convention): FROM where the wind comes (0=N, 90=E, 180=S, 270=W)
// Bearing: cyclist heading (0=N, 90=E, ...)
// Relative angle: positive = wind from the right
export function computeRelativeWind(windDirection: number, bearingDeg: number, windSpeed: number): WindRelative {
  // Convert: angle between wind-from and cyclist heading
  // 0 = pure headwind (wind blows in our face)
  // 180 = pure tailwind
  let angle = windDirection - bearingDeg
  // Normalize to -180..180
  angle = ((angle + 180) % 360) - 180

  // Effective headwind component (+= head, -= tail)
  const effectiveSpeed = windSpeed * Math.cos((angle * Math.PI) / 180)

  let windClass: WindClass
  const abs = Math.abs(angle)
  if (abs <= 45) windClass = 'headwind'
  else if (abs >= 135) windClass = 'tailwind'
  else windClass = effectiveSpeed > 0 ? 'crosswind-unfavorable' : 'crosswind-favorable'

  return { angle, class: windClass, effectiveSpeed }
}

export async function enrichActivityWithWind(activity: Activity): Promise<Activity> {
  const windData = await fetchWindForActivity(activity)

  const points: GpxPoint[] = activity.points.map((p) => {
    const { speed, direction } = interpolateWind(p.time, windData)
    const windRelative = computeRelativeWind(direction, p.bearing ?? 0, speed)
    return { ...p, windSpeed: speed, windDirection: direction, windRelative }
  })

  // Summary stats
  return { ...activity, points, windFetched: true }
}

export function windColor(speed: number): string {
  if (speed < 10) return '#22d3ee'
  if (speed < 25) return '#86efac'
  if (speed < 40) return '#fbbf24'
  return '#f87171'
}

// Single source of truth for the face/dos/travers colors, matching the map route's
// paint expression (MapView.tsx) and index.css's --color-headwind/tailwind/crosswind-*
export const WIND_CLASS_COLOR: Record<WindClass, string> = {
  headwind: '#f87171',
  'crosswind-unfavorable': '#fb923c',
  'crosswind-favorable': '#bef264',
  tailwind: '#86efac',
}

export function windClassLabel(cls: WindClass): string {
  switch (cls) {
    case 'headwind': return 'Vent de face'
    case 'tailwind': return 'Vent dans le dos'
    case 'crosswind-favorable': return 'Vent de travers favorable'
    case 'crosswind-unfavorable': return 'Vent de travers défavorable'
  }
}

export function activityWindSummary(activity: Activity): {
  headwind: number
  tailwind: number
  crosswindFavorable: number
  crosswindUnfavorable: number
  avgSpeed: number
} {
  const pts = activity.points.filter((p) => p.windRelative)
  if (!pts.length) return { headwind: 0, tailwind: 0, crosswindFavorable: 0, crosswindUnfavorable: 0, avgSpeed: 0 }

  let headwind = 0, tailwind = 0, crosswindFavorable = 0, crosswindUnfavorable = 0, totalSpeed = 0
  for (const p of pts) {
    const cls = p.windRelative!.class
    if (cls === 'headwind') headwind++
    else if (cls === 'tailwind') tailwind++
    else if (cls === 'crosswind-favorable') crosswindFavorable++
    else crosswindUnfavorable++
    totalSpeed += p.windSpeed ?? 0
  }
  const total = pts.length
  return {
    headwind: Math.round((headwind / total) * 100),
    tailwind: Math.round((tailwind / total) * 100),
    crosswindFavorable: Math.round((crosswindFavorable / total) * 100),
    crosswindUnfavorable: Math.round((crosswindUnfavorable / total) * 100),
    avgSpeed: Math.round(totalSpeed / total),
  }
}

// Circular mean — a plain average of degrees breaks near the 0/360 wrap
export function averageWind(activity: Activity): { speed: number; direction: number } | null {
  const pts = activity.points.filter((p) => p.windSpeed !== undefined && p.windDirection !== undefined)
  if (!pts.length) return null

  let sumSin = 0, sumCos = 0, sumSpeed = 0
  for (const p of pts) {
    const rad = (p.windDirection! * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
    sumSpeed += p.windSpeed!
  }
  const direction = (Math.atan2(sumSin, sumCos) * 180) / Math.PI
  return {
    speed: sumSpeed / pts.length,
    direction: (direction + 360) % 360,
  }
}

// Effort scoring — a heuristic, not exact cycling power physics. Weights and caps
// are tunable constants, not derived from a rigorous model.
export const EFFORT_WIND_WEIGHT = 0.6
export const EFFORT_CLIMB_WEIGHT = 0.4
const EFFORT_CLIMB_CAP_M_PER_KM = 25 // gradient load considered "very hard", saturates at 100

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// avgEffective: net headwind(+)/tailwind(-) component, km/h.
// avgCrossMag: average perpendicular (crosswind) magnitude, km/h — penalized more
// lightly since it costs less energy than direct headwind but still hurts comfort.
function windEffortScore(avgEffective: number, avgCrossMag: number): number {
  const load = avgEffective + 0.3 * avgCrossMag
  return Math.round(clamp(((load + 20) / 60) * 100, 0, 100))
}

export interface EffortScore {
  total: number // 0-100, higher = harder
  wind: number
  climb: number
}

// Exact score for the currently loaded activity — uses per-point wind already
// fetched for its planned start time.
export function computeEffortScore(activity: Activity): EffortScore | null {
  if (!activity.windFetched) return null
  const pts = activity.points.filter((p) => p.windRelative && p.windSpeed !== undefined)
  if (!pts.length) return null

  let sumEffective = 0, sumCross = 0
  for (const p of pts) {
    sumEffective += p.windRelative!.effectiveSpeed
    sumCross += Math.abs(p.windSpeed! * Math.sin((Math.abs(p.windRelative!.angle) * Math.PI) / 180))
  }
  const wind = windEffortScore(sumEffective / pts.length, sumCross / pts.length)

  const climb = activity.distanceMeters > 0
    ? Math.round(clamp((activity.elevationGain / (activity.distanceMeters / 1000) / EFFORT_CLIMB_CAP_M_PER_KM) * 100, 0, 100))
    : 0

  return {
    total: Math.round(EFFORT_WIND_WEIGHT * wind + EFFORT_CLIMB_WEIGHT * climb),
    wind,
    climb,
  }
}

// Ranks several routes against each other at a single shared departure time —
// the inverse of estimateWindEffort's "same route, many hours" scan. Each
// candidate gets a real per-point wind fetch (not the sampled approximation)
// since the candidate count is small and user-triggered, so exactness is
// affordable and matters for a "which route should I actually ride" decision.
export async function rankByWind(
  activities: Activity[],
  target: Date,
): Promise<{ activity: Activity; score: EffortScore }[]> {
  const enriched = await Promise.all(
    activities.map((a) => enrichActivityWithWind(shiftActivityStart(a, target))),
  )
  const results = enriched
    .map((activity) => ({ activity, score: computeEffortScore(activity) }))
    .filter((r): r is { activity: Activity; score: EffortScore } => r.score !== null)
  return results.sort((a, b) => a.score.total - b.score.total)
}

// Approximate wind-only effort for a candidate forecast hour — reuses the route's
// real point bearings but a single direction/speed reading (no per-point wind
// data exists yet for hours that haven't been committed), sampled for performance.
export function estimateWindEffort(activity: Activity, direction: number, speed: number): number {
  const points = activity.points
  if (!points.length) return 0
  const step = Math.max(1, Math.floor(points.length / 100))

  let sumEffective = 0, sumCross = 0, n = 0
  for (let i = 0; i < points.length; i += step) {
    const rel = computeRelativeWind(direction, points[i].bearing ?? 0, speed)
    sumEffective += rel.effectiveSpeed
    sumCross += Math.abs(speed * Math.sin((Math.abs(rel.angle) * Math.PI) / 180))
    n++
  }
  return windEffortScore(sumEffective / n, sumCross / n)
}

export function effortLabel(score: number): string {
  if (score < 25) return 'Facile'
  if (score < 50) return 'Modéré'
  if (score < 75) return 'Difficile'
  return 'Extrême'
}

export function effortColor(score: number): string {
  if (score < 25) return '#86efac'
  if (score < 50) return '#bef264'
  if (score < 75) return '#fb923c'
  return '#f87171'
}
