import clsx from 'clsx'

type Panel = 'sorties' | 'comparer'

function RailButton({ active, onClick, title, badge, children }: {
  active: boolean
  onClick: () => void
  title: string
  badge?: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'relative w-11 h-11 flex items-center justify-center rounded-xl text-lg transition-colors',
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'text-[var(--color-rail-icon)] hover:text-[var(--color-text-primary)]',
      )}
    >
      {children}
      {!!badge && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-accent)] text-[var(--color-surface-0)] text-[9px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  )
}

export function NavRail({ activePanel, onToggle, shortlistedCount }: {
  activePanel: Panel | null
  onToggle: (panel: Panel) => void
  shortlistedCount: number
}) {
  return (
    <nav className="hidden md:flex w-[52px] shrink-0 flex-col items-center gap-2 border-r border-[var(--color-border)] bg-[var(--color-surface-1)] py-3">
      <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center mb-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <RailButton active={activePanel === 'sorties'} onClick={() => onToggle('sorties')} title="Sorties">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </RailButton>

      <RailButton active={activePanel === 'comparer'} onClick={() => onToggle('comparer')} title="Comparateur vent" badge={shortlistedCount}>
        🏆
      </RailButton>
    </nav>
  )
}
