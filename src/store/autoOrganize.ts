import { create } from 'zustand'
import { useActivities } from './activities'
import { useFolders } from './folders'
import { getStoredTokens } from '@/lib/strava-auth'
import { fetchStravaActivities, importStravaActivity } from '@/lib/strava'
import { fetchStravaRoutes, importStravaRoute } from '@/lib/strava-routes'
import { bucketLabelForDistance, buildStravaId } from '@/lib/auto-organize'
import type { Activity } from '@/types'

// A Zustand store, not component-local state — the sync/classify run must
// survive the button that started it being unmounted (closing the Sorties
// panel, switching tabs). A useState-based hook loses its progress on
// remount even though the run keeps going in the background: the button
// resets to "idle" while the import silently continues, invisible and
// re-clickable into a second concurrent run.

// Same concurrency cap as rankByWind's comparator batching (wind-math.ts) —
// firing every import at once trips Strava's burst rate limit well before
// its documented daily quota.
const IMPORT_CONCURRENCY = 3

export type AutoOrganizePhase = 'idle' | 'fetching' | 'importing' | 'classifying' | 'done' | 'error'

export interface AutoOrganizeProgress {
  phase: AutoOrganizePhase
  imported: number
  skipped: number
  failed: number
  classified: number
  total: number
  error: string | null
}

const IDLE: AutoOrganizeProgress = {
  phase: 'idle', imported: 0, skipped: 0, failed: 0, classified: 0, total: 0, error: null,
}

const RUNNING_PHASES: AutoOrganizePhase[] = ['fetching', 'importing', 'classifying']

interface AutoOrganizeState {
  progress: AutoOrganizeProgress
  run: () => Promise<void>
}

export const useAutoOrganize = create<AutoOrganizeState>((set, get) => ({
  progress: IDLE,

  run: async () => {
    // A stray click while a run from a previous mount is still going (exactly
    // the scenario this store exists to prevent) — ignore instead of
    // stacking a second concurrent sync on top of the first.
    if (RUNNING_PHASES.includes(get().progress.phase)) return

    set({ progress: { ...IDLE, phase: 'fetching' } })
    try {
      const connected = getStoredTokens() !== null
      let imported = 0
      let skipped = 0
      let failed = 0

      if (connected) {
        const existingIds = new Set(
          useActivities.getState().activities.map((a) => a.stravaId).filter((id): id is string => Boolean(id)),
        )
        const existingFingerprints = new Set(
          useActivities.getState().activities.map((a) => a.fingerprint).filter((f): f is string => Boolean(f)),
        )

        const [activitySummaries, routeSummaries] = await Promise.all([fetchStravaActivities(), fetchStravaRoutes()])

        const pending: { stravaId: string; fetchActivity: () => Promise<Activity> }[] = []
        for (const a of activitySummaries) {
          const stravaId = buildStravaId('activity', a.id)
          if (!existingIds.has(stravaId)) pending.push({ stravaId, fetchActivity: () => importStravaActivity(a) })
        }
        for (const r of routeSummaries) {
          const stravaId = buildStravaId('route', r.id)
          if (!existingIds.has(stravaId)) pending.push({ stravaId, fetchActivity: () => importStravaRoute(r) })
        }

        set((s) => ({ progress: { ...s.progress, phase: 'importing', total: pending.length } }))

        for (let i = 0; i < pending.length; i += IMPORT_CONCURRENCY) {
          const batch = pending.slice(i, i + IMPORT_CONCURRENCY)
          const results = await Promise.allSettled(batch.map((item) => item.fetchActivity()))
          for (const result of results) {
            // A single failed fetch (network blip, an activity with no GPS
            // stream) shouldn't abort the whole sync — count it and move on.
            if (result.status !== 'fulfilled') { failed++; continue }
            const activity = result.value
            // A fingerprint match here means this exact ride is already in the
            // library under a different stravaId (e.g. saved both as a Strava
            // activity and a Strava route) — skip the redundant copy.
            if (activity.fingerprint && existingFingerprints.has(activity.fingerprint)) {
              skipped++
              continue
            }
            // Isolated per item — an IndexedDB write failure on one activity
            // shouldn't abort the sync for the rest of the batch.
            try {
              if (activity.fingerprint) existingFingerprints.add(activity.fingerprint)
              await useActivities.getState().addActivity(activity)
              imported++
            } catch {
              failed++
            }
          }
          set((s) => ({ progress: { ...s.progress, imported, skipped, failed } }))
        }
      }

      set((s) => ({ progress: { ...s.progress, phase: 'classifying' } }))

      const unfiled = useActivities.getState().activities.filter((a) => a.folderId === null)
      const folderIdByLabel = new Map(useFolders.getState().folders.map((f) => [f.name, f.id]))

      let classified = 0
      for (const activity of unfiled) {
        // Isolated per activity — a storage failure moving one shouldn't stop
        // the rest of the (already fetched, already deduped) batch from filing.
        try {
          const label = bucketLabelForDistance(activity.distanceMeters)
          let folderId = folderIdByLabel.get(label)
          if (!folderId) {
            const folder = await useFolders.getState().addFolder(label)
            folderId = folder.id
            folderIdByLabel.set(label, folderId)
          }
          await useActivities.getState().moveActivity(activity.id, folderId)
          classified++
        } catch {
          failed++
        }
      }

      set((s) => ({ progress: { ...s.progress, phase: 'done', classified, failed } }))
    } catch (e) {
      set((s) => ({
        progress: {
          ...s.progress,
          phase: 'error',
          error: e instanceof Error ? e.message : "Erreur lors de l'organisation automatique.",
        },
      }))
    }
  },
}))
