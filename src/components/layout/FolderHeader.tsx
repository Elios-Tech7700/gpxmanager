import { useState } from 'react'
import type { Folder } from '@/types'

export function FolderHeader({ folder, count, weight, expanded, onToggle, onRename, onDelete }: {
  folder: Folder
  count: number
  // 0-1, count relative to the largest folder — renders a small proportional
  // bar so the weight of e.g. "0-10 km (72)" vs "50-60 km (2)" reads at a
  // glance instead of requiring a side-by-side comparison of the numbers.
  weight?: number
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
          className="text-xs font-semibold tracking-wide text-[var(--color-text-secondary)] truncate flex-1 min-w-0 cursor-pointer"
        >
          {folder.name}
        </p>
      )}
      {weight !== undefined && !editing && (
        <div className="h-1 w-10 rounded-full bg-[var(--color-surface-2)] overflow-hidden shrink-0" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.round(weight * 100)}%` }} />
        </div>
      )}
      {!editing && <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">{count}</span>}
      <div className="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {/* w-11 h-11 (44px) is the minimum comfortable touch target — -m-2.5
            expands the tap area beyond the visual icon without pushing the
            row's spacing around, same trick as ActivityCard's "⋯" button.
            text-base (up from text-xs) and a round background on press make
            the icon itself read as a bigger, tappable button, not just a
            bigger invisible zone around a small glyph. */}
        <button onClick={startEditing} title="Renommer" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] active:bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-3)] rounded-full w-11 h-11 -m-2.5 flex items-center justify-center text-base shrink-0 transition-colors">
          ✎
        </button>
        <button onClick={onDelete} title="Supprimer le dossier" className="text-[var(--color-text-muted)] hover:text-[var(--color-wind-strong)] active:bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-3)] rounded-full w-11 h-11 -m-2.5 flex items-center justify-center text-base shrink-0 transition-colors">
          ✕
        </button>
      </div>
    </div>
  )
}
