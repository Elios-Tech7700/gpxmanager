import { create } from 'zustand'
import type { Activity } from '@/types'

// Which folders (plus the "non classées" bucket, keyed by null) feed the
// comparator. Kept separate from the folders/activities stores and not
// persisted to IndexedDB — it's a transient view filter, not app data, and a
// single Zustand instance means the selection survives the panel/tab/sheet
// unmounting and remounting the comparator in different places.
interface CompareFilterState {
  selectedFolderIds: Set<string>
  includeUnfiled: boolean
  toggleFolder: (id: string) => void
  toggleUnfiled: () => void
}

export const useCompareFilter = create<CompareFilterState>((set) => ({
  selectedFolderIds: new Set(),
  includeUnfiled: false,

  toggleFolder: (id) => set((s) => {
    const next = new Set(s.selectedFolderIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { selectedFolderIds: next }
  }),

  toggleUnfiled: () => set((s) => ({ includeUnfiled: !s.includeUnfiled })),
}))

export function getCompareCandidates(
  activities: Activity[],
  selectedFolderIds: Set<string>,
  includeUnfiled: boolean,
): Activity[] {
  return activities.filter((a) =>
    a.folderId ? selectedFolderIds.has(a.folderId) : includeUnfiled,
  )
}
