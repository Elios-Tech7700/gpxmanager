import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useActivities } from '@/store/activities'
import { useFolders } from '@/store/folders'
import { useCompareFilter, getCompareCandidates } from '@/store/compareFilter'
import { roundUpToHalfHour } from '@/lib/schedule'
import { datetimeLocalBounds, toDatetimeLocalValue } from '@/lib/datetime-local'
import { formatDist } from '@/lib/format'
import { rankByWind, effortColor, effortLabel, type EffortScore } from '@/lib/wind-math'
import type { Activity } from '@/types'
import clsx from 'clsx'

const MIN_CANDIDATES = 2

export function CompareSection({ onSelect }: { onSelect: (id: string) => void }) {
  const activities = useActivities((s) => s.activities)
  const updateActivity = useActivities((s) => s.updateActivity)
  const folders = useFolders((s) => s.folders)
  const { selectedFolderIds, includeUnfiled, toggleFolder, toggleUnfiled } = useCompareFilter(
    useShallow((s) => ({
      selectedFolderIds: s.selectedFolderIds,
      includeUnfiled: s.includeUnfiled,
      toggleFolder: s.toggleFolder,
      toggleUnfiled: s.toggleUnfiled,
    })),
  )

  const candidates = getCompareCandidates(activities, selectedFolderIds, includeUnfiled)
  const unfiledCount = activities.filter((a) => !a.folderId).length
  const bounds = datetimeLocalBounds()

  const [targetInput, setTargetInput] = useState(() => toDatetimeLocalValue(roundUpToHalfHour(new Date())))
  const [debouncedTarget, setDebouncedTarget] = useState(targetInput)
  // Ranking results are kept in local state only — earlier versions persisted every
  // ranked candidate via updateActivity, which rewrote each one's startTime/points
  // in IndexedDB on every debounce tick (including routes never actually picked)
  // and desynced the map from whichever candidate happened to be active. Only the
  // activity the user actually clicks gets persisted, in handleSelect below.
  const [results, setResults] = useState<{ activity: Activity; score: EffortScore }[] | null>(null)
  const [failedCount, setFailedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidateIds = candidates.map((a) => a.id).join(',')

  // The native datetime-local picker can commit several intermediate values while
  // the user is still adjusting it — debounce so each one doesn't fire a fresh
  // batch of Open-Meteo requests for every selected route.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTarget(targetInput), 400)
    return () => clearTimeout(t)
  }, [targetInput])

  useEffect(() => {
    if (candidates.length < MIN_CANDIDATES) { setResults(null); setFailedCount(0); return }
    // The datetime-local input can be cleared to an empty string by the user
    // (backspace, browser "clear" affordance) — new Date('') is an Invalid
    // Date that would otherwise reach shiftActivityStart/date-fns and throw.
    const target = new Date(debouncedTarget)
    if (Number.isNaN(target.getTime())) { setResults(null); setFailedCount(0); return }

    let cancelled = false
    setLoading(true)
    setError(null)
    rankByWind(candidates, target)
      .then(({ results: ranked, failedCount: failed }) => {
        if (cancelled) return
        setResults(ranked)
        setFailedCount(failed)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur lors du calcul') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // candidateIds (not the array reference) avoids re-running when a previous
    // selection's updateActivity call below replaces that activity with a new copy
  }, [candidateIds, debouncedTarget])

  const handleSelect = async (result: { activity: Activity; score: EffortScore }) => {
    await updateActivity(result.activity)
    onSelect(result.activity.id)
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div>
        <p className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wider mb-1.5">
          Comparer les dossiers
        </p>
        <div className="flex flex-wrap gap-1.5">
          {folders.map((f) => {
            const count = activities.filter((a) => a.folderId === f.id).length
            const on = selectedFolderIds.has(f.id)
            return (
              <button
                key={f.id}
                onClick={() => toggleFolder(f.id)}
                className={clsx(
                  'text-xs px-3 min-h-9 rounded-full border transition-colors',
                  on
                    ? 'bg-[var(--color-accent)]/15 border-[var(--color-accent)]/50 text-[var(--color-accent)]'
                    : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)]',
                )}
              >
                {f.name} <span className="opacity-70">({count})</span>
              </button>
            )
          })}
          {unfiledCount > 0 && (
            <button
              onClick={toggleUnfiled}
              className={clsx(
                'text-xs px-3 min-h-9 rounded-full border transition-colors',
                includeUnfiled
                  ? 'bg-[var(--color-accent)]/15 border-[var(--color-accent)]/50 text-[var(--color-accent)]'
                  : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)]',
              )}
            >
              Non classées <span className="opacity-70">({unfiledCount})</span>
            </button>
          )}
          {folders.length === 0 && unfiledCount === 0 && (
            <p className="text-xs text-[var(--color-text-muted)]">Aucune sortie importée pour l'instant.</p>
          )}
        </div>
      </div>

      {candidates.length < MIN_CANDIDATES ? (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Sélectionne un ou plusieurs dossiers ci-dessus totalisant au moins {MIN_CANDIDATES} itinéraires pour comparer le vent.{' '}
          <span className="text-[var(--color-text-muted)]">({candidates.length}/{MIN_CANDIDATES})</span>
        </p>
      ) : (
        <>
          <input
            type="datetime-local"
            value={targetInput}
            step={1800}
            min={bounds.min}
            max={bounds.max}
            onChange={(e) => setTargetInput(e.target.value)}
            className="w-full text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 outline-none text-[var(--color-text-primary)]"
          />

          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--color-text-muted)]">
              <span className="w-3.5 h-3.5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
              Calcul du vent en cours…
            </div>
          )}

          {error && <p className="text-xs text-[var(--color-wind-strong)] py-2">{error}</p>}

          {!loading && !error && failedCount > 0 && (
            <p className="text-xs text-[var(--color-wind-moderate)] py-1">
              {failedCount} itinéraire{failedCount > 1 ? 's' : ''} non comparé{failedCount > 1 ? 's' : ''} (erreur réseau).
            </p>
          )}

          {!loading && !error && results && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <button
                  key={r.activity.id}
                  onClick={() => handleSelect(r)}
                  className={clsx(
                    'w-full text-left rounded-lg px-2.5 py-2 transition-colors border',
                    i === 0
                      ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40'
                      : 'bg-[var(--color-surface-2)] border-transparent hover:border-[var(--color-border)]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)] w-4 shrink-0">#{i + 1}</span>
                    <p className="text-sm font-medium text-[var(--color-text-primary)] truncate flex-1 min-w-0">{r.activity.name}</p>
                    <span className="text-xs font-semibold shrink-0" style={{ color: effortColor(r.score.total) }}>
                      {r.score.total}/100
                    </span>
                  </div>
                  {i === 0 && <p className="text-[10px] text-[var(--color-accent-hover)] font-medium mt-0.5 ml-6">🏆 Meilleur choix</p>}
                  <div className="flex items-center gap-3 mt-1 ml-6">
                    <span className="text-xs text-[var(--color-text-secondary)]">{formatDist(r.activity.distanceMeters)}</span>
                    <span className="text-xs" style={{ color: effortColor(r.score.total) }}>
                      {effortLabel(r.score.total)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
