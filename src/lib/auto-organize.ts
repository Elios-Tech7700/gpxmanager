import type { Activity, Folder } from '@/types'

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

// Dedup key for activities with no stable Strava id (manual GPX uploads), and
// a safety net even for Strava imports — catches the same ride existing as
// both a Strava "activity" and a saved Strava "route" (different id spaces,
// so stravaId alone wouldn't catch it).
export function computeFingerprint(activity: Pick<Activity, 'name' | 'distanceMeters' | 'points'>): string {
  return `${activity.name}|${Math.round(activity.distanceMeters)}|${activity.points.length}`
}

// Retroactive cleanup: groups activities already sitting in the library that
// share a fingerprint — i.e. duplicates imported before this dedup existed
// (or from before the app tracked fingerprints at all, if that field is unset
// on old records — those are simply never grouped, nothing to compare them on).
export function findDuplicateGroups(activities: Activity[]): Activity[][] {
  const byFingerprint = new Map<string, Activity[]>()
  for (const activity of activities) {
    if (!activity.fingerprint) continue
    const group = byFingerprint.get(activity.fingerprint)
    if (group) group.push(activity)
    else byFingerprint.set(activity.fingerprint, [activity])
  }
  return [...byFingerprint.values()].filter((group) => group.length > 1)
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
