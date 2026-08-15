import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useShallow } from 'zustand/shallow'
import { useActivities } from '@/store/activities'
import { useFolders } from '@/store/folders'
import { DropZone } from '@/components/import/DropZone'
import { StravaImport } from '@/components/import/StravaImport'
import type { Activity, Folder } from '@/types'
import clsx from 'clsx'

function formatDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function formatDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

function ActivityCard({ activity, active, folders, onSelect, onDelete, onRename, onMove, onDuplicate }: {
  activity: Activity
  active: boolean
  folders: Folder[]
  onSelect: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onMove: (folderId: string | null) => void
  onDuplicate: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(activity.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => { setMenuOpen(false); setMoveSubmenuOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const startEditing = () => {
    setDraft(activity.name)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== activity.name) onRename(trimmed)
    setEditing(false)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!editing) onSelect() }}
      onKeyDown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) onSelect() }}
      className={clsx(
        'w-full text-left rounded-lg px-3 py-3 transition-all duration-150 group relative cursor-pointer',
        active
          ? 'bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30'
          : 'bg-[var(--color-surface-2)] border border-transparent hover:border-[var(--color-border)]',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setDraft(activity.name); setEditing(false) }
            }}
            className="text-sm font-medium bg-transparent border-b border-[var(--color-accent)] outline-none flex-1 min-w-0 text-[var(--color-text-primary)]"
          />
        ) : (
          <p
            onDoubleClick={(e) => { e.stopPropagation(); startEditing() }}
            className={clsx('text-sm font-medium truncate', active ? 'text-[var(--color-accent-hover)]' : 'text-[var(--color-text-primary)]')}
          >
            {activity.name}
          </p>
        )}
        <div className="flex items-center shrink-0 -mr-2.5 relative">
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setMoveSubmenuOpen(false) }}
            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity w-11 h-11 -m-2.5 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-base leading-none"
            title="Plus d'actions"
          >
            ⋯
          </span>

          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] shadow-lg py-1 text-xs"
            >
              {!moveSubmenuOpen ? (
                <>
                  <button
                    onClick={() => { onDuplicate(); setMenuOpen(false) }}
                    className="w-full text-left px-3 min-h-11 flex items-center hover:bg-[var(--color-surface-2)] text-[var(--color-text-primary)]"
                  >
                    ⧉ Dupliquer
                  </button>
                  <button
                    onClick={() => setMoveSubmenuOpen(true)}
                    className="w-full text-left px-3 min-h-11 flex items-center hover:bg-[var(--color-surface-2)] text-[var(--color-text-primary)]"
                  >
                    📁 Déplacer vers…
                  </button>
                  <button
                    onClick={() => { startEditing(); setMenuOpen(false) }}
                    className="w-full text-left px-3 min-h-11 flex items-center hover:bg-[var(--color-surface-2)] text-[var(--color-text-primary)]"
                  >
                    ✎ Renommer
                  </button>
                  <button
                    onClick={() => { onDelete(); setMenuOpen(false) }}
                    className="w-full text-left px-3 min-h-11 flex items-center hover:bg-[var(--color-surface-2)] text-[var(--color-wind-strong)]"
                  >
                    ✕ Supprimer
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setMoveSubmenuOpen(false)}
                    className="w-full text-left px-3 min-h-11 flex items-center hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]"
                  >
                    ‹ Retour
                  </button>
                  {activity.folderId && (
                    <button
                      onClick={() => { onMove(null); setMenuOpen(false); setMoveSubmenuOpen(false) }}
                      className="w-full text-left px-3 min-h-11 flex items-center hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]"
                    >
                      Retirer du dossier
                    </button>
                  )}
                  {folders.length === 0 ? (
                    <p className="px-3 py-2.5 text-[var(--color-text-muted)]">Aucun dossier</p>
                  ) : (
                    folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { onMove(f.id); setMenuOpen(false); setMoveSubmenuOpen(false) }}
                        disabled={f.id === activity.folderId}
                        className="w-full text-left px-3 min-h-11 flex items-center hover:bg-[var(--color-surface-2)] disabled:opacity-40 text-[var(--color-text-primary)] truncate"
                      >
                        {f.name}
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        {format(activity.startTime, 'd MMM yyyy, HH:mm', { locale: fr })}
      </p>
      <div className="flex gap-3 mt-2 items-center">
        <span className="text-xs text-[var(--color-text-secondary)]">{formatDist(activity.distanceMeters)}</span>
        <span className="text-xs text-[var(--color-text-secondary)]">{formatDuration(activity.durationSeconds)}</span>
        <span className="text-xs text-[var(--color-text-secondary)]">↑{Math.round(activity.elevationGain)} m</span>
        {activity.windFetched && (
          <span className="ml-auto text-[10px] text-[var(--color-wind-calm)] font-medium shrink-0">vent ✓</span>
        )}
      </div>
    </div>
  )
}

function FolderHeader({ folder, count, expanded, onToggle, onRename, onDelete }: {
  folder: Folder
  count: number
  expanded: boolean
  onToggle: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(folder.name)

  const startEditing = () => {
    setDraft(folder.name)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== folder.name) onRename(trimmed)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-1 px-1 py-1 group">
      <button onClick={onToggle} className="text-[var(--color-text-muted)] text-xs w-8 h-8 flex items-center justify-center shrink-0">
        {expanded ? '▾' : '▸'}
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(folder.name); setEditing(false) }
          }}
          className="text-xs font-semibold tracking-wide bg-transparent border-b border-[var(--color-accent)] outline-none flex-1 min-w-0 text-[var(--color-text-secondary)]"
        />
      ) : (
        <p
          onDoubleClick={startEditing}
          onClick={onToggle}
          className="text-xs font-semibold tracking-wide text-[var(--color-text-secondary)] truncate flex-1 cursor-pointer"
        >
          {folder.name} <span className="text-[var(--color-text-muted)] font-normal">({count})</span>
        </p>
      )}
      <div className="flex items-center shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <span role="button" onClick={startEditing} title="Renommer" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] w-9 h-9 flex items-center justify-center text-xs">
          ✎
        </span>
        <span role="button" onClick={onDelete} title="Supprimer le dossier" className="text-[var(--color-text-muted)] hover:text-[var(--color-wind-strong)] w-9 h-9 flex items-center justify-center text-xs">
          ✕
        </span>
      </div>
    </div>
  )
}

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
      <StravaImport />

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
