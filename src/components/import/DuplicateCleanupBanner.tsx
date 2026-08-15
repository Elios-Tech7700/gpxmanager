import { useMemo, useState } from 'react'
import { useActivities } from '@/store/activities'
import { findDuplicateGroups, pickKeeper } from '@/lib/auto-organize'
import clsx from 'clsx'

// Surfaces duplicates already sitting in the library (imported before this
// app deduped, or from any gap in that logic) — separate from the sync/import
// flow so deleting activities always requires its own explicit confirmation,
// never as a side effect of clicking something else.
export function DuplicateCleanupBanner() {
  const activities = useActivities((s) => s.activities)
  const removeActivity = useActivities((s) => s.removeActivity)
  const [armed, setArmed] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  const groups = useMemo(() => findDuplicateGroups(activities), [activities])

  if (groups.length === 0) return null

  const toRemove = groups.flatMap((group) => {
    const keeper = pickKeeper(group)
    return group.filter((a) => a.id !== keeper.id)
  })

  const handleClick = async () => {
    if (!armed) { setArmed(true); return }
    setCleaning(true)
    for (const a of toRemove) {
      try {
        await removeActivity(a.id)
      } catch {
        // best-effort — one failed delete shouldn't block the rest of the cleanup
      }
    }
    setCleaning(false)
    setArmed(false)
  }

  return (
    <div className="mx-4 mb-2 px-3 py-2.5 rounded-lg border border-[var(--color-wind-moderate)]/40 bg-[var(--color-wind-moderate)]/10">
      <p className="text-xs text-[var(--color-text-primary)]">
        {groups.length} doublon{groups.length === 1 ? '' : 's'} détecté{groups.length === 1 ? '' : 's'}
        {' — '}
        {toRemove.length} copie{toRemove.length === 1 ? '' : 's'} en trop.
      </p>
      {armed && !cleaning && (
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
          La copie déjà classée (ou avec le vent chargé) est gardée à chaque fois, les autres sont supprimées.
        </p>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <button
          onClick={handleClick}
          disabled={cleaning}
          className={clsx(
            'text-xs font-medium px-2.5 py-1 rounded disabled:opacity-60 transition-colors',
            armed
              ? 'bg-[var(--color-wind-strong)] text-white'
              : 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]',
          )}
        >
          {cleaning
            ? 'Suppression…'
            : armed
              ? `Confirmer la suppression de ${toRemove.length} sortie${toRemove.length === 1 ? '' : 's'}`
              : 'Nettoyer les doublons'}
        </button>
        {armed && !cleaning && (
          <button
            onClick={() => setArmed(false)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}
