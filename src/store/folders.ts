import { create } from 'zustand'
import type { Folder } from '@/types'
import { saveFolder, loadFolders, deleteFolderRecord } from '@/lib/storage'
import { generateId } from '@/lib/gpx-parser'
import { useActivities } from './activities'

interface FoldersState {
  folders: Folder[]
  loading: boolean
  init: () => Promise<void>
  addFolder: (name: string) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
}

export const useFolders = create<FoldersState>((set, get) => ({
  folders: [],
  loading: true,

  init: async () => {
    const folders = await loadFolders()
    set({ folders, loading: false })
  },

  addFolder: async (name) => {
    const folder: Folder = { id: generateId(), name, createdAt: new Date() }
    await saveFolder(folder)
    set((s) => ({ folders: [...s.folders, folder] }))
  },

  renameFolder: async (id, name) => {
    const folder = get().folders.find((f) => f.id === id)
    if (!folder) return
    const updated = { ...folder, name }
    await saveFolder(updated)
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? updated : f)) }))
  },

  deleteFolder: async (id) => {
    await deleteFolderRecord(id)
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }))

    const orphaned = useActivities.getState().activities.filter((a) => a.folderId === id)
    await Promise.all(orphaned.map((a) => useActivities.getState().moveActivity(a.id, null)))
  },
}))
