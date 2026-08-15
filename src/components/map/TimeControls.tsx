import { useState } from 'react'
import { format } from 'date-fns'
import { datetimeLocalBounds } from '@/lib/datetime-local'
import clsx from 'clsx'

interface Props {
  plannedAt: string
  windFetched: boolean
  loading: boolean
  error: string | null
  onCommit: (target: Date) => void
  onShift: (minutes: number) => void
  onLoadWind: () => void
}

// The floating pill above the map: collapsed it's just a time readout + the
// load/recalculate action; expanded it exposes the -30/+30/+1h nudges and the
// raw datetime-local picker. Bounds come from datetime-local.ts so they can
// never drift from what CompareSection's own picker allows.
export function TimeControls({ plannedAt, windFetched, loading, error, onCommit, onShift, onLoadWind }: Props) {
  const [open, setOpen] = useState(false)
  const bounds = datetimeLocalBounds()

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 w-[92vw] max-w-md md:w-auto">
      {!windFetched && (
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-1)]/90 backdrop-blur rounded-full px-2.5 py-1 border border-[var(--color-border)]">
          <span className="inline-block w-2.5 h-0.5 rounded-full bg-[var(--color-accent)]" />tracé (vent non chargé)
        </span>
      )}
      <div className="flex flex-wrap items-center justify-center gap-1.5 bg-[var(--color-surface-1)]/95 backdrop-blur rounded-2xl md:rounded-full pl-1 pr-1 py-1 border border-[var(--color-border)] shadow-lg">
        {open ? (
          <>
            <button
              onClick={() => onShift(-30)}
              disabled={loading}
              title="-30 min"
              className="w-6 h-6 flex items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0 disabled:opacity-40"
            >
              −
            </button>
            <input
              type="datetime-local"
              value={plannedAt}
              step={1800}
              min={bounds.min}
              max={bounds.max}
              onChange={(e) => onCommit(new Date(e.target.value))}
              className="bg-transparent text-xs text-[var(--color-text-primary)] outline-none"
            />
            <button
              onClick={() => onShift(30)}
              disabled={loading}
              title="+30 min"
              className="w-6 h-6 flex items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0 disabled:opacity-40"
            >
              +
            </button>
            <button
              onClick={() => onShift(60)}
              disabled={loading}
              title="+1 heure"
              className="text-[11px] px-1.5 h-6 flex items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0 disabled:opacity-40"
            >
              +1h
            </button>
            <button
              onClick={() => setOpen(false)}
              title="Fermer"
              className="w-6 h-6 flex items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 px-3 h-6 rounded-full text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] shrink-0"
          >
            {format(new Date(plannedAt), 'HH:mm')}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        <button
          onClick={onLoadWind}
          disabled={loading}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all shrink-0',
            loading
              ? 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)] cursor-wait'
              : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white shadow shadow-[var(--color-accent)]/30',
          )}
        >
          {loading ? (
            <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Chargement…</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" strokeLinecap="round" strokeLinejoin="round"/></svg>{windFetched ? 'Recalculer' : 'Charger le vent'}</>
          )}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-[var(--color-wind-strong)] text-center">{error}</p>}
    </div>
  )
}
