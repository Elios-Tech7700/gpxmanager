import type { Activity, Folder } from '@/types'
import { haversineDistance } from './geo'

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

const BUCKET_NAME_PATTERN = /^(\d+)-\d+ km$/

// Used to decide the button's label ("Organiser" vs "Mettre à jour") — true
// once at least one distance-bucket folder already exists from a past run.
export function isBucketFolderName(name: string): boolean {
  return BUCKET_NAME_PATTERN.test(name)
}

// Folders are stored (and were previously listed) in creation order, which
// for auto-generated buckets is whichever distance happened to come up
// first while classifying — "30-40 km" before "0-10 km" before "100-110 km".
// A plain alphabetical sort doesn't fix this either: "100-110 km" < "20-30 km"
// lexicographically since '1' < '2'. Bucket folders need their start-km
// parsed out and compared as numbers; manually named folders (no such
// pattern) sort alphabetically ahead of the auto-generated ladder.
export function compareFolders(a: Pick<Folder, 'name'>, b: Pick<Folder, 'name'>): number {
  const startA = a.name.match(BUCKET_NAME_PATTERN)
  const startB = b.name.match(BUCKET_NAME_PATTERN)
  if (startA && startB) return Number(startA[1]) - Number(startB[1])
  if (startA) return 1
  if (startB) return -1
  return a.name.localeCompare(b.name, 'fr')
}

export function buildStravaId(kind: 'activity' | 'route', id: string): string {
  return `${kind}-${id}`
}

// A GPX recording never starts/stops at the exact same GPS coordinate twice —
// you press "stop" on the bike computer a bit early or late, or the fix drifts
// a little before the first satellite lock. Exact-match dedup (same name,
// same distance, same point count) essentially never fires on a genuinely
// repeated commute for this reason. Instead: two activities are the same real
// ride if their start points are close, their end points are close, and their
// total distance is close — regardless of exactly how many points either one
// recorded or what they're each named.
export const DUPLICATE_RADIUS_METERS = 500

// Total distance can drift by close to 2× the point radius if start and end
// both happen to shift outward on the same ride — plus a relative margin so
// long rides (where a few hundred meters is noise) aren't over-strict either.
function distanceTolerance(distanceMeters: number): number {
  return Math.max(DUPLICATE_RADIUS_METERS * 2, distanceMeters * 0.1)
}

export function isNearDuplicate(
  a: Pick<Activity, 'distanceMeters' | 'points'>,
  b: Pick<Activity, 'distanceMeters' | 'points'>,
): boolean {
  if (!a.points.length || !b.points.length) return false
  if (Math.abs(a.distanceMeters - b.distanceMeters) > distanceTolerance(Math.max(a.distanceMeters, b.distanceMeters))) {
    return false
  }

  const aStart = a.points[0]
  const bStart = b.points[0]
  if (haversineDistance(aStart.lat, aStart.lon, bStart.lat, bStart.lon) > DUPLICATE_RADIUS_METERS) return false

  const aEnd = a.points[a.points.length - 1]
  const bEnd = b.points[b.points.length - 1]
  return haversineDistance(aEnd.lat, aEnd.lon, bEnd.lat, bEnd.lon) <= DUPLICATE_RADIUS_METERS
}

// Retroactive cleanup: groups activities already sitting in the library that
// look like the same ride recorded more than once. Each new activity joins
// the first existing group whose first member it's a near-duplicate of —
// O(n²) in the worst case, acceptable for a library in the hundreds/low
// thousands and only recomputed when the activity list actually changes.
export function findDuplicateGroups(activities: Activity[]): Activity[][] {
  const groups: Activity[][] = []
  for (const activity of activities) {
    if (!activity.points.length) continue
    const group = groups.find((g) => isNearDuplicate(g[0], activity))
    if (group) group.push(activity)
    else groups.push([activity])
  }
  return groups.filter((group) => group.length > 1)
}

// Which copy survives a cleanup — prefers one already filed in a folder (real
// user effort not to be discarded), then one with wind already loaded, then
// simply the earliest import.
export function pickKeeper(group: Activity[]): Activity {
  return group.reduce((best, candidate) => {
    if (best.folderId && !candidate.folderId) return best
    if (candidate.folderId && !best.folderId) return candidate
    if (best.windFetched && !candidate.windFetched) return best
    if (candidate.windFetched && !best.windFetched) return candidate
    return candidate.importedAt < best.importedAt ? candidate : best
  })
}
