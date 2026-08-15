import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatDist, formatDuration } from '@/lib/format'
import type { Activity, Folder } from '@/types'
import clsx from 'clsx'

export function ActivityCard({ activity, active, folders, onSelect, onDelete, onRename, onMove, onDuplicate }: {
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
