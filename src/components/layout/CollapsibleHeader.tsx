// Shared expand/collapse row header — used for groupings that aren't a real
// Folder record (the "Ajouter des sorties" wrapper, the "Par distance" meta-group)
// as well as StravaImport's own sections, so every disclosure control in the
// panel has the same 44px touch target and visual language.
export function CollapsibleHeader({ label, expanded, onToggle, badge }: {
  label: string
  expanded: boolean
  onToggle: () => void
  badge?: string
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 min-h-11 text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wider hover:text-[var(--color-text-primary)]"
    >
      <span className="text-[var(--color-text-muted)] w-4 shrink-0 text-xs">{expanded ? '▾' : '▸'}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge && <span className="text-[var(--color-text-muted)] font-normal normal-case shrink-0">{badge}</span>}
    </button>
  )
}
