import { useState } from 'react'
import { activityWindSummary, WIND_CLASS_COLOR, computeEffortScore, effortLabel, effortColor } from '@/lib/wind-math'
import type { Activity } from '@/types'
import clsx from 'clsx'

export function WindSummaryBadge({ activity }: { activity: Activity | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!activity?.windFetched) return null
  const s = activityWindSummary(activity)
  const effort = computeEffortScore(activity)
  const rows: { label: string; pct: number; color: string }[] = [
    { label: 'face', pct: s.headwind, color: WIND_CLASS_COLOR.headwind },
    { label: 'travers défav.', pct: s.crosswindUnfavorable, color: WIND_CLASS_COLOR['crosswind-unfavorable'] },
    { label: 'travers favo.', pct: s.crosswindFavorable, color: WIND_CLASS_COLOR['crosswind-favorable'] },
    { label: 'dos', pct: s.tailwind, color: WIND_CLASS_COLOR.tailwind },
  ]
  return (
    <div className="absolute top-3 left-3 z-10 max-w-[calc(100vw-1.5rem)] bg-[var(--color-surface-1)]/90 backdrop-blur rounded-lg border border-[var(--color-border)] text-xs overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {effort ? (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: effortColor(effort.total) }} />
            <span className="font-semibold shrink-0" style={{ color: effortColor(effort.total) }}>{effort.total}/100</span>
            <span className="text-[var(--color-text-muted)] truncate">· {effortLabel(effort.total)}</span>
          </>
        ) : (
          <span className="text-[var(--color-text-muted)] font-medium uppercase tracking-wider text-[10px]">Résumé vent</span>
        )}
        <svg
          className={clsx('ml-auto shrink-0 text-[var(--color-text-muted)] transition-transform', expanded && 'rotate-180')}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 pt-2 space-y-1.5 border-t border-[var(--color-border)]">
          {effort && (
            <div className="space-y-1 pb-1 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${effort.total}%`, backgroundColor: effortColor(effort.total) }} />
                </div>
              </div>
              <p className="text-[var(--color-text-muted)]">
                Effort {effortLabel(effort.total).toLowerCase()} — vent {effort.wind}, dénivelé {effort.climb}
              </p>
            </div>
          )}
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                <span className="text-[var(--color-text-secondary)] w-24">{r.label}</span>
                <span className="font-medium" style={{ color: r.color }}>{r.pct}%</span>
              </div>
            ))}
          </div>
          <p className="text-[var(--color-text-muted)] pt-0.5 border-t border-[var(--color-border)]">Moy. {s.avgSpeed} km/h</p>
        </div>
      )}
    </div>
  )
}
