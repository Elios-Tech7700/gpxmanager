import type { Activity } from '@/types'

// Distance-bucket folders created by the "Organiser automatiquement" flow —
// pure helpers only, no store/network access, so they're trivial to reason
// about independently of the orchestration hook that calls them.

export const DISTANCE_BUCKET_KM = 10

// Floors to the bucket start — a 10.0 km ride lands in "10-20 km", not "0-10 km".
export function bucketLabelForDistance(distanceMeters: number): string {
  const km = distanceMeters / 1000
  const start = Math.max(0, Math.floor(km / DISTANCE_BUCKET_KM) * DISTANCE_BUCKET_KM)
  return `${start}-${start + DISTANCE_BUCKET_KM} km`
}

const BUCKET_NAME_PATTERN = /^\d+-\d+ km$/

// Used to decide the button's label ("Organiser" vs "Mettre à jour") — true
// once at least one distance-bucket folder already exists from a past run.
export function isBucketFolderName(name: string): boolean {
  return BUCKET_NAME_PATTERN.test(name)
}

export function buildStravaId(kind: 'activity' | 'route', id: string): string {
  return `${kind}-${id}`
}

// Dedup key for activities with no stable Strava id (manual GPX uploads), and
// a safety net even for Strava imports — catches the same ride existing as
// both a Strava "activity" and a saved Strava "route" (different id spaces,
// so stravaId alone wouldn't catch it).
export function computeFingerprint(activity: Pick<Activity, 'name' | 'distanceMeters' | 'points'>): string {
  return `${activity.name}|${Math.round(activity.distanceMeters)}|${activity.points.length}`
}
