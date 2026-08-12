export function FlyoutPanel({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="hidden md:flex fixed inset-y-0 left-[52px] z-30 w-[300px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-2xl">
      <div className="shrink-0 px-4 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <button
          onClick={onClose}
          className="w-9 h-9 -m-2 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
    </div>
  )
}
