import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useActivities } from '@/store/activities'
import { roundUpToHalfHour } from '@/lib/schedule'
import { rankByWind, effortColor, effortLabel, type EffortScore } from '@/lib/wind-math'
import type { Activity } from '@/types'
import clsx from 'clsx'

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm"
const MAX_FORECAST_DAYS = 15
const MIN_CANDIDATES = 2

function formatDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

export function CompareSection({ onSelect }: { onSelect: (id: string) => void }) {
  const activities = useActivities((s) => s.activities)
  const updateActivity = useActivities((s) => s.updateActivity)

  const shortlisted = activities.filter((a) => a.shortlisted)

  const [targetInput, setTargetInput] = useState(() => format(roundUpToHalfHour(new Date()), DATETIME_LOCAL_FORMAT))
  const [results, setResults] = useState<{ activity: Activity; score: EffortScore }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shortlistedIds = shortlisted.map((a) => a.id).join(',')

  useEffect(() => {
    if (shortlisted.length < MIN_CANDIDATES) return
    let cancelled = false
    setLoading(true)
    setError(null)
    rankByWind(shortlisted, new Date(targetInput))
      .then(async (ranked) => {
        if (cancelled) return
        await Promise.all(ranked.map((r) => updateActivity(r.activity)))
        if (!cancelled) setResults(ranked)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur lors du calcul') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // shortlistedIds (not the array reference) avoids re-running when updateActivity
    // above replaces the same activities with newly enriched copies
  }, [shortlistedIds, targetInput])

  return (
    <div className="px-4 py-3 border-b border-[var(--color-border)]">
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">🏆 Comparateur vent</h2>

      {shortlisted.length < MIN_CANDIDATES ? (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Sélectionne au moins {MIN_CANDIDATES} itinéraires avec ⭐ dans la liste pour voir lequel a le meilleur vent.{' '}
          <span className="text-[var(--color-text-muted)]">({shortlisted.length}/{MIN_CANDIDATES} sélectionné{shortlisted.length > 1 ? 's' : ''})</span>
        </p>
      ) : (
        <>
          <input
            type="datetime-local"
            value={targetInput}
            step={1800}
            min={format(new Date(), DATETIME_LOCAL_FORMAT)}
            max={format(new Date(Date.now() + MAX_FORECAST_DAYS * 86400000), DATETIME_LOCAL_FORMAT)}
            onChange={(e) => setTargetInput(e.target.value)}
            className="w-full text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 outline-none text-[var(--color-text-primary)] mb-2"
          />

          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--color-text-muted)]">
              <span className="w-3.5 h-3.5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
              Calcul du vent en cours…
            </div>
          )}

          {error && <p className="text-xs text-[var(--color-wind-strong)] py-2">{error}</p>}

          {!loading && !error && results && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <button
                  key={r.activity.id}
                  onClick={() => onSelect(r.activity.id)}
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
