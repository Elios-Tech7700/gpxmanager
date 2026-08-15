import { create } from 'zustand'
import type { Activity } from '@/types'
import { saveActivity, loadActivities, deleteActivity } from '@/lib/storage'
import { generateId } from '@/lib/gpx-parser'

interface ActivitiesState {
  activities: Activity[]
  activeId: string | null
  loading: boolean
  error: string | null
  // actions
  init: () => Promise<void>
  addActivity: (activity: Activity) => Promise<void>
  removeActivity: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  updateActivity: (activity: Activity) => Promise<void>
  moveActivity: (id: string, folderId: string | null) => Promise<void>
  duplicateActivity: (id: string) => Promise<void>
  cleanOrphanedFolderRefs: (validFolderIds: Set<string>) => Promise<void>
}

export const useActivities = create<ActivitiesState>((set, get) => ({
  activities: [],
  activeId: null,
  loading: true,
  error: null,

  init: async () => {
    try {
      const activities = await loadActivities()
      set({ activities, loading: false, activeId: activities[0]?.id ?? null })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Erreur de chargement des sorties' })
    }
  },

  addActivity: async (activity) => {
    await saveActivity(activity)
    set((s) => ({
      activities: [activity, ...s.activities],
      activeId: activity.id,
    }))
  },

  removeActivity: async (id) => {
    await deleteActivity(id)
    set((s) => {
      const activities = s.activities.filter((a) => a.id !== id)
      const activeId = s.activeId === id ? (activities[0]?.id ?? null) : s.activeId
      return { activities, activeId }
    })
  },

  setActive: (id) => set({ activeId: id }),

  updateActivity: async (activity) => {
    await saveActivity(activity)
    set((s) => ({
      activities: s.activities.map((a) => (a.id === activity.id ? activity : a)),
    }))
  },

  moveActivity: async (id, folderId) => {
    const activity = get().activities.find((a) => a.id === id)
    if (!activity) return
    const updated = { ...activity, folderId }
    await saveActivity(updated)
    set((s) => ({ activities: s.activities.map((a) => (a.id === id ? updated : a)) }))
  },

  duplicateActivity: async (id) => {
    const activity = get().activities.find((a) => a.id === id)
    if (!activity) return
    const copy: Activity = { ...activity, id: generateId(), name: `${activity.name} (copie)`, importedAt: new Date() }
    await saveActivity(copy)
    set((s) => ({ activities: [copy, ...s.activities], activeId: copy.id }))
  },

  // Safety net for activities left pointing at a folder that no longer exists
  // (e.g. data from before folder deletion became atomic) — called once from
  // App.tsx after both stores have finished loading.
  cleanOrphanedFolderRefs: async (validFolderIds) => {
    const orphaned = get().activities.filter((a) => a.folderId && !validFolderIds.has(a.folderId))
    if (!orphaned.length) return
    await Promise.all(orphaned.map((a) => get().moveActivity(a.id, null)))
  },
}))

export const useActiveActivity = () =>
  useActivities((s) => s.activities.find((a) => a.id === s.activeId) ?? null)
