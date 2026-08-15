import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Without this, any unhandled render error (a corrupted IndexedDB record,
// a malformed GPX slipping past parsing) unmounts the whole app to a blank
// white screen with no way back short of clearing storage manually in devtools.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur non gérée dans GPX Manager :', error, info.componentStack)
  }

  private resetAndReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  private clearDataAndReload = async () => {
    try {
      const dbs = await indexedDB.databases?.()
      await Promise.all((dbs ?? []).map((db) => db.name && indexedDB.deleteDatabase(db.name)))
    } finally {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--color-surface-0)] px-6 text-center">
        <p className="text-base font-semibold text-[var(--color-text-primary)]">Une erreur est survenue</p>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">
          GPX Manager a rencontré un problème inattendu. Recharge la page pour continuer.
        </p>
        <div className="flex gap-2">
          <button
            onClick={this.resetAndReload}
            className="text-sm px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium"
          >
            Recharger
          </button>
          <button
            onClick={this.clearDataAndReload}
            className="text-sm px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]"
          >
            Réinitialiser les données et recharger
          </button>
        </div>
      </div>
    )
  }
}
