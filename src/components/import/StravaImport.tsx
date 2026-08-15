import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useActivities } from '@/store/activities'
import { shiftActivityStart } from '@/lib/schedule'
import { buildAuthorizeUrl, clearTokens, consumeOAuthState, deauthorize, exchangeCode, getStoredTokens, type StravaTokens } from '@/lib/strava-auth'
import { fetchStravaActivities, importStravaActivity, type StravaActivitySummary } from '@/lib/strava'
import { fetchStravaRoutes, importStravaRoute, type StravaRouteSummary } from '@/lib/strava-routes'

export function StravaImport() {
  const [tokens, setTokens] = useState<StravaTokens | null>(() => getStoredTokens())
  const [activities, setActivities] = useState<StravaActivitySummary[] | null>(null)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [activitiesOpen, setActivitiesOpen] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [routes, setRoutes] = useState<StravaRouteSummary[] | null>(null)
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [routesOpen, setRoutesOpen] = useState(false)
  const [importingRouteId, setImportingRouteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addActivity = useActivities((s) => s.addActivity)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return
    const state = params.get('state')
    window.history.replaceState({}, '', window.location.pathname)
    if (!consumeOAuthState(state)) {
      setError('Connexion Strava refusée (état de sécurité invalide, réessaie).')
      return
    }
    exchangeCode(code)
      .then(setTokens)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur de connexion Strava'))
  }, [])

  // Lazy-loaded on first expand — no point fetching a list the user never opens
  useEffect(() => {
    if (!tokens || !activitiesOpen || activities !== null) return
    setLoadingActivities(true)
    setError(null)
    fetchStravaActivities()
      .then(setActivities)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoadingActivities(false))
  }, [tokens, activitiesOpen, activities])

  useEffect(() => {
    if (!tokens || !routesOpen || routes !== null) return
    setLoadingRoutes(true)
    fetchStravaRoutes()
      .then(setRoutes)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoadingRoutes(false))
  }, [tokens, routesOpen, routes])

  const handleImport = async (summary: StravaActivitySummary) => {
    setImportingId(summary.id)
    setError(null)
    try {
      const activity = shiftActivityStart(await importStravaActivity(summary), new Date())
      await addActivity(activity)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur import')
    } finally {
      setImportingId(null)
    }
  }

  const handleImportRoute = async (summary: StravaRouteSummary) => {
    setImportingRouteId(summary.id)
    setError(null)
    try {
      const activity = shiftActivityStart(await importStravaRoute(summary), new Date())
      await addActivity(activity)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur import')
    } finally {
      setImportingRouteId(null)
    }
  }

  const handleDisconnect = async () => {
    await deauthorize()
    clearTokens()
    setTokens(null)
    setActivities(null)
    setRoutes(null)
    setActivitiesOpen(false)
    setRoutesOpen(false)
  }

  if (!tokens) {
    return (
      <div className="px-4 pb-4">
        <a
          href={buildAuthorizeUrl()}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors"
        >
          Connecter Strava
        </a>
        {error && <p className="mt-2 text-xs text-[var(--color-wind-strong)] px-1">{error}</p>}
      </div>
    )
  }

  return (
    <div className="px-4 pb-4 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-[var(--color-wind-calm)] font-medium uppercase tracking-wider">Strava connecté</p>
        <button onClick={handleDisconnect} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          Déconnecter
        </button>
      </div>

      <div>
        <button
          onClick={() => setActivitiesOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 py-1.5 text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wider hover:text-[var(--color-text-primary)]"
        >
          <span className="text-[var(--color-text-muted)] w-2.5 shrink-0">{activitiesOpen ? '▾' : '▸'}</span>
          Activités Strava
        </button>

        {activitiesOpen && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {loadingActivities && <p className="text-xs text-[var(--color-text-muted)] px-1">Chargement…</p>}
            {activities && activities.length === 0 && !loadingActivities && (
              <p className="text-xs text-[var(--color-text-muted)] px-1">Aucune activité vélo récente trouvée.</p>
            )}
            {activities?.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-surface-2)] px-2.5 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{a.name}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {format(new Date(a.startDate), 'd MMM yyyy', { locale: fr })} · {(a.distanceMeters / 1000).toFixed(1)} km
                  </p>
                </div>
                <button
                  onClick={() => handleImport(a)}
                  disabled={importingId === a.id}
                  className="shrink-0 text-[10px] font-medium px-2 py-1 rounded bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 text-white"
                >
                  {importingId === a.id ? '…' : 'Importer'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] pt-1">
        <button
          onClick={() => setRoutesOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 py-1.5 text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wider hover:text-[var(--color-text-primary)]"
        >
          <span className="text-[var(--color-text-muted)] w-2.5 shrink-0">{routesOpen ? '▾' : '▸'}</span>
          Itinéraires Strava
        </button>

        {routesOpen && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {loadingRoutes && <p className="text-xs text-[var(--color-text-muted)] px-1">Chargement…</p>}
            {routes && routes.length === 0 && !loadingRoutes && (
              <p className="text-xs text-[var(--color-text-muted)] px-1">Aucun itinéraire enregistré trouvé.</p>
            )}
            {routes?.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-surface-2)] px-2.5 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{r.name}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {(r.distanceMeters / 1000).toFixed(1)} km · ↑{Math.round(r.elevationGain)} m
                  </p>
                </div>
                <button
                  onClick={() => handleImportRoute(r)}
                  disabled={importingRouteId === r.id}
                  className="shrink-0 text-[10px] font-medium px-2 py-1 rounded bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 text-white"
                >
                  {importingRouteId === r.id ? '…' : 'Importer'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-[var(--color-wind-strong)] px-1">{error}</p>}
    </div>
  )
}
