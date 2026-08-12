import clsx from 'clsx'

type Tab = 'carte' | 'sorties' | 'comparer'

function TabItem({ active, onClick, label, badge, children }: {
  active: boolean
  onClick: () => void
  label: string
  badge?: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
        active ? 'text-[var(--color-accent)]' : 'text-[var(--color-rail-icon)]',
      )}
    >
      <span className="text-base leading-none">{children}</span>
      {label}
      {!!badge && (
        <span className="absolute top-1 right-[28%] min-w-[15px] h-[15px] px-1 rounded-full bg-[var(--color-accent)] text-[var(--color-surface-0)] text-[8px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  )
}

export function MobileTabBar({ active, onChange, shortlistedCount }: {
  active: Tab
  onChange: (tab: Tab) => void
  shortlistedCount: number
}) {
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 h-14 flex border-t border-[var(--color-border)] bg-[var(--color-surface-1)]">
      <TabItem active={active === 'carte'} onClick={() => onChange('carte')} label="Carte">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block">
          <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 7v13M15 4v13" strokeLinecap="round" />
        </svg>
      </TabItem>
      <TabItem active={active === 'sorties'} onClick={() => onChange('sorties')} label="Sorties">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </TabItem>
      <TabItem active={active === 'comparer'} onClick={() => onChange('comparer')} label="Comparer" badge={shortlistedCount}>
        🏆
      </TabItem>
    </nav>
  )
}
