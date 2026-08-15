import { create } from 'zustand'
import type { Folder } from '@/types'
import { saveFolder, loadFolders, deleteFolderRecord } from '@/lib/storage'
import { generateId } from '@/lib/gpx-parser'
import { useActivities } from './activities'
import { useCompareFilter } from './compareFilter'

interface FoldersState {
  folders: Folder[]
  loading: boolean
  error: string | null
  init: () => Promise<void>
  addFolder: (name: string) => Promise<Folder>
  renameFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
}

export const useFolders = create<FoldersState>((set, get) => ({
  folders: [],
  loading: true,
  error: null,

  init: async () => {
    try {
      const folders = await loadFolders()
      set({ folders, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Erreur de chargement des dossiers' })
    }
  },

  addFolder: async (name) => {
    const folder: Folder = { id: generateId(), name, createdAt: new Date() }
    await saveFolder(folder)
    set((s) => ({ folders: [...s.folders, folder] }))
    return folder
  },

  renameFolder: async (id, name) => {
    const folder = get().folders.find((f) => f.id === id)
    if (!folder) return
    const updated = { ...folder, name }
    await saveFolder(updated)
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? updated : f)) }))
  },

  deleteFolder: async (id) => {
    // Un-file every activity in this folder BEFORE removing the folder record.
    // Doing it in the other order leaves a window (closed tab, a rejected
    // moveActivity) where activities point at a folderId that no longer
    // resolves to anything — invisible in both the folder view (gone) and the
    // "non classées" view (folderId still set), effectively lost.
    const orphaned = useActivities.getState().activities.filter((a) => a.folderId === id)
    await Promise.all(orphaned.map((a) => useActivities.getState().moveActivity(a.id, null)))

    await deleteFolderRecord(id)
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }))
    useCompareFilter.getState().removeFolder(id)
  },
}))
