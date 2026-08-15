import { Suspense, lazy, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useActivities } from '@/store/activities'
import { useFolders } from '@/store/folders'
import { DropZone } from '@/components/import/DropZone'
import { AutoOrganizeButton } from '@/components/import/AutoOrganizeButton'
import { ActivityCard } from '@/components/layout/ActivityCard'
import { FolderHeader } from '@/components/layout/FolderHeader'
import type { Activity } from '@/types'

// Pulls in the Strava OAuth/fetch flow, only relevant once this panel is
// actually opened — split out of the main bundle so it doesn't load on first paint.
const StravaImport = lazy(() => import('@/components/import/StravaImport').then((m) => ({ default: m.StravaImport })))

export function SortiesPanel({ onSelectActivity }: { onSelectActivity: () => void }) {
  const { activities, activeId, setActive, removeActivity, updateActivity, moveActivity, duplicateActivity } = useActivities(
    useShallow((s) => ({
      activities: s.activities,
      activeId: s.activeId,
      setActive: s.setActive,
      removeActivity: s.removeActivity,
      updateActivity: s.updateActivity,
      moveActivity: s.moveActivity,
      duplicateActivity: s.duplicateActivity,
    })),
  )
  const { folders, addFolder, renameFolder, deleteFolder } = useFolders(
    useShallow((s) => ({
      folders: s.folders,
      addFolder: s.addFolder,
      renameFolder: s.renameFolder,
      deleteFolder: s.deleteFolder,
    })),
  )
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const toggleFolder = (id: string) => {
    setExpandedFolders((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const unfiled = activities.filter((a) => !a.folderId)

  const cardProps = (a: Activity) => ({
    activity: a,
    active: a.id === activeId,
    folders,
    onSelect: () => { setActive(a.id); onSelectActivity() },
    onDelete: () => removeActivity(a.id),
    onRename: (name: string) => updateActivity({ ...a, name }),
    onMove: (folderId: string | null) => moveActivity(a.id, folderId),
    onDuplicate: () => duplicateActivity(a.id),
  })

  return (
    <div className="px-3 py-3 space-y-3">
      <DropZone />
      <Suspense fallback={null}>
        <StravaImport />
      </Suspense>
      <AutoOrganizeButton />

      <div className="space-y-0.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wider">Dossiers</p>
          <button
            onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
            className="text-[10px] text-[var(--color-accent-hover)] hover:text-[var(--color-text-primary)] min-h-8 px-1"
          >
            + Nouveau
          </button>
        </div>

        {creatingFolder && (
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={() => {
              const trimmed = newFolderName.trim()
              if (trimmed) addFolder(trimmed)
              setCreatingFolder(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const trimmed = newFolderName.trim()
                if (trimmed) addFolder(trimmed)
                setCreatingFolder(false)
              }
              if (e.key === 'Escape') setCreatingFolder(false)
            }}
            placeholder="Nom du dossier"
            className="w-full text-xs bg-[var(--color-surface-2)] border border-[var(--color-accent)] rounded px-2 py-1.5 outline-none text-[var(--color-text-primary)]"
          />
        )}

        {folders.map((f) => {
          const folderActivities = activities.filter((a) => a.folderId === f.id)
          const expanded = expandedFolders.has(f.id)
          return (
            <div key={f.id}>
              <FolderHeader
                folder={f}
                count={folderActivities.length}
                expanded={expanded}
                onToggle={() => toggleFolder(f.id)}
                onRename={(name) => renameFolder(f.id, name)}
                onDelete={() => deleteFolder(f.id)}
              />
              {expanded && (
                <div className="space-y-1.5 pl-3 pb-1.5">
                  {folderActivities.length === 0 ? (
                    <p className="text-[10px] text-[var(--color-text-muted)] px-1 pb-1">Vide</p>
                  ) : (
                    folderActivities.map((a) => <ActivityCard key={a.id} {...cardProps(a)} />)
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="space-y-1.5">
        {folders.length > 0 && (
          <p className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wider px-1">Non classées</p>
        )}
        {activities.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] text-center mt-4">
            Aucune sortie importée
          </p>
        ) : unfiled.length === 0 && folders.length > 0 ? (
          <p className="text-[10px] text-[var(--color-text-muted)] px-1">Aucune</p>
        ) : (
          unfiled.map((a) => <ActivityCard key={a.id} {...cardProps(a)} />)
        )}
      </div>
    </div>
  )
}
