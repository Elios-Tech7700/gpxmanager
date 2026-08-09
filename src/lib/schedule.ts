import type { Activity, GpxPoint } from '@/types'

// Rounds up to the next 30-minute mark so a freshly imported activity (or a
// fresh comparison) defaults to a sensible near-future planned start instead
// of the current exact second.
export function roundUpToHalfHour(date: Date): Date {
  const ms = 30 * 60 * 1000
  return new Date(Math.ceil(date.getTime() / ms) * ms)
}

// Re-anchors the route's relative pacing (from the GPX) onto a new planned start
// time, so wind can be fetched for a future ride instead of the recording's date.
export function shiftActivityStart(activity: Activity, newStartTime: Date): Activity {
  const offsetMs = newStartTime.getTime() - activity.startTime.getTime()

  const points: GpxPoint[] = activity.points.map((p) => ({
    ...p,
    time: new Date(p.time.getTime() + offsetMs),
    windSpeed: undefined,
    windDirection: undefined,
    windRelative: undefined,
  }))

  return {
    ...activity,
    points,
    startTime: newStartTime,
    endTime: new Date(activity.endTime.getTime() + offsetMs),
    windFetched: false,
  }
}
