import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { format } from 'date-fns'
import { useActiveActivity, useActivities } from '@/store/activities'
import { enrichActivityWithWind, activityWindSummary, averageWind, WIND_CLASS_COLOR, computeEffortScore, effortLabel, effortColor } from '@/lib/wind-math'
import { shiftActivityStart, roundUpToHalfHour } from '@/lib/schedule'
import { reverseActivity } from '@/lib/gpx-parser'
import { WindForecast } from '@/components/timeline/WindForecast'
import { WindAnimation } from '@/components/map/WindAnimation'
import type { Activity } from '@/types'
import clsx from 'clsx'

const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm"
const MAX_FORECAST_DAYS = 15

const MAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
} as const
type MapTheme = keyof typeof MAP_STYLES
const CASING_COLOR: Record<MapTheme, string> = { dark: '#ffffff', light: '#0f172a' }
const THEME_STORAGE_KEY = 'gpxmanager-map-theme'

function WindSummaryBadge({ activity }: { activity: Activity | null }) {
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

function buildWindSegments(activity: Activity) {
  return {
    type: 'FeatureCollection' as const,
    features: activity.points.slice(0, -1).map((point, i) => ({
      type: 'Feature' as const,
      properties: { windClass: point.windRelative?.class ?? 'crosswind-unfavorable' },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [point.lon, point.lat],
          [activity.points[i + 1].lon, activity.points[i + 1].lat],
        ],
      },
    })),
  }
}

// Redraws the route. Sources/layers are only torn down and rebuilt when they
// don't exist yet (fresh map/style) — a wind recalculation on the SAME route
// (activity.id unchanged) reuses the existing sources via setData(), so it
// doesn't flash-rebuild the whole layer stack or fight the user's zoom.
// `refit` gates fitBounds separately: only pass true when the route itself
// changed, never on a same-route wind recolor.
function applyRoute(
  map: maplibregl.Map,
  activity: Activity,
  theme: MapTheme,
  markersRef: { current: { start: maplibregl.Marker | null; end: maplibregl.Marker | null } },
  refit: boolean,
) {
  const coords = activity.points.map((p) => [p.lon, p.lat])
  const lineGeometry = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: coords },
  }

  const plainSource = map.getSource('route-geojson') as maplibregl.GeoJSONSource | undefined
  if (plainSource) {
    plainSource.setData(lineGeometry)
  } else {
    map.addSource('route-geojson', { type: 'geojson', data: lineGeometry })
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route-geojson', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': CASING_COLOR[theme], 'line-width': 8, 'line-opacity': 0.25 } })
  }

  if (activity.windFetched) {
    // tolerance: 0 — the source is thousands of tiny 2-point segments; MapLibre's
    // default tile simplification collapses most of them to nothing when zoomed out
    const windSource = map.getSource('route-wind') as maplibregl.GeoJSONSource | undefined
    if (windSource) {
      windSource.setData(buildWindSegments(activity))
    } else {
      map.addSource('route-wind', { type: 'geojson', data: buildWindSegments(activity), tolerance: 0 })
      map.addLayer({
        id: 'route-wind-line',
        type: 'line',
        source: 'route-wind',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': 4,
          'line-color': ['match', ['get', 'windClass'],
            'headwind',              WIND_CLASS_COLOR.headwind,
            'crosswind-unfavorable', WIND_CLASS_COLOR['crosswind-unfavorable'],
            'crosswind-favorable',   WIND_CLASS_COLOR['crosswind-favorable'],
            'tailwind',              WIND_CLASS_COLOR.tailwind,
            '#ff8a3d',
          ] as unknown as string,
        },
      })
    }
    if (map.getLayer('route-line')) map.removeLayer('route-line')
  } else {
    if (map.getLayer('route-wind-line')) map.removeLayer('route-wind-line')
    if (map.getSource('route-wind')) map.removeSource('route-wind')
    if (!map.getLayer('route-line')) {
      map.addLayer({ id: 'route-line', type: 'line', source: 'route-geojson', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff8a3d', 'line-width': 4 } })
    }
  }

  const start = activity.points[0]
  const end = activity.points[activity.points.length - 1]
  if (markersRef.current.start && markersRef.current.end) {
    markersRef.current.start.setLngLat([start.lon, start.lat])
    markersRef.current.end.setLngLat([end.lon, end.lat])
  } else {
    markersRef.current.start?.remove()
    markersRef.current.end?.remove()
    markersRef.current = {
      start: new maplibregl.Marker({ color: '#86efac' }).setLngLat([start.lon, start.lat]).addTo(map),
      end: new maplibregl.Marker({ color: '#f87171' }).setLngLat([end.lon, end.lat]).addTo(map),
    }
  }

  if (refit) {
    const [minLon, minLat, maxLon, maxLat] = activity.bounds
    // Use animate:false — fitBounds with animation blocks before map is fully loaded
    map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 80, animate: false, maxZoom: 14 })
  }
}

export function MapView({ onOpenSorties, onOpenCompare, compareCount }: {
  onOpenSorties: () => void
  onOpenCompare: () => void
  compareCount: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const pendingActivityRef = useRef<Activity | null>(null)
  const routeMarkersRef = useRef<{ start: maplibregl.Marker | null; end: maplibregl.Marker | null }>({ start: null, end: null })
  // Which activity.id the camera was last fitted to — fitBounds only re-runs when
  // this changes, so a same-route wind recalc doesn't reset the user's zoom/pan.
  const lastFittedIdRef = useRef<string | null>(null)
  // Bumped on every handleLoadWind call so a slow, superseded fetch can detect
  // it's stale and skip its setState/updateActivity once it resolves.
  const windRequestIdRef = useRef(0)

  const activity = useActiveActivity()
  const updateActivity = useActivities((s) => s.updateActivity)
  const [loadingWind, setLoadingWind] = useState(false)
  const [windError, setWindError] = useState<string | null>(null)
  const [plannedAt, setPlannedAt] = useState(() => format(new Date(), DATETIME_LOCAL_FORMAT))
  const [timeControlsOpen, setTimeControlsOpen] = useState(false)
  const [theme, setTheme] = useState<MapTheme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'dark'
  })
  const themeRef = useRef(theme)
  useEffect(() => { themeRef.current = theme }, [theme])

  // Sync the date/time picker to the active activity's planned start, and auto-fetch
  // wind for it so no manual click is needed. Fresh imports carry the GPX recording's
  // (past) date, which isn't useful for wind planning — default those to "now" instead.
  useEffect(() => {
    if (!activity) return
    if (activity.windFetched) {
      setPlannedAt(format(activity.startTime, DATETIME_LOCAL_FORMAT))
    } else {
      const target = roundUpToHalfHour(new Date())
      setPlannedAt(format(target, DATETIME_LOCAL_FORMAT))
      handleLoadWind(target)
    }
  }, [activity?.id])

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[themeRef.current],
      center: [2.3, 46.5],
      zoom: 5,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    // Draw any pending activity once style is ready. A (re)loaded style has no
    // sources/camera yet, so this always refits regardless of lastFittedIdRef.
    const tryDraw = () => {
      if (pendingActivityRef.current) {
        applyRoute(map, pendingActivityRef.current, themeRef.current, routeMarkersRef, true)
        lastFittedIdRef.current = pendingActivityRef.current.id
        pendingActivityRef.current = null
      }
    }
    map.on('style.load', tryDraw)
    // Also try on first render as fallback
    map.once('render', tryDraw)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Draw route when activity changes
  useEffect(() => {
    const map = mapRef.current
    if (!activity) return

    if (!map) {
      pendingActivityRef.current = activity
      return
    }

    // Try immediately — MapLibre queues addSource/addLayer until style is ready
    try {
      const refit = lastFittedIdRef.current !== activity.id
      applyRoute(map, activity, themeRef.current, routeMarkersRef, refit)
      lastFittedIdRef.current = activity.id
    } catch {
      // Style not ready yet — queue it and wait for style.load
      pendingActivityRef.current = activity
    }
    // Depends on the whole activity object (not just id/windFetched), since
    // recalculating wind for a new time keeps windFetched=true but replaces
    // activity.points with new per-point wind colors that must be redrawn.
  }, [activity])

  const handleLoadWind = async (targetOverride?: Date, activityOverride?: Activity) => {
    const base = activityOverride ?? activity
    if (!base) return
    const requestId = ++windRequestIdRef.current
    setLoadingWind(true)
    setWindError(null)
    try {
      const target = targetOverride ?? new Date(plannedAt)
      const shifted = shiftActivityStart(base, target)
      const enriched = await enrichActivityWithWind(shifted)
      // A more recent handleLoadWind call (fast +/-30min tap, or switching
      // activity mid-fetch) has already superseded this one — drop the result.
      if (windRequestIdRef.current !== requestId) return
      await updateActivity(enriched)
    } catch (e) {
      if (windRequestIdRef.current !== requestId) return
      setWindError(e instanceof Error ? e.message : 'Erreur lors du chargement du vent')
    } finally {
      if (windRequestIdRef.current === requestId) setLoadingWind(false)
    }
  }

  const commitPlannedAt = (target: Date) => {
    if (Number.isNaN(target.getTime())) return
    setPlannedAt(format(target, DATETIME_LOCAL_FORMAT))
    handleLoadWind(target)
  }

  const shiftPlannedAt = (minutes: number) => {
    commitPlannedAt(new Date(new Date(plannedAt).getTime() + minutes * 60 * 1000))
  }

  const handleReverseRoute = () => {
    if (!activity) return
    handleLoadWind(undefined, reverseActivity(activity))
  }

  const toggleTheme = () => {
    const next: MapTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem(THEME_STORAGE_KEY, next)
    const map = mapRef.current
    if (map) {
      if (activity) pendingActivityRef.current = activity
      map.setStyle(MAP_STYLES[next])
    }
  }

  const wind = activity?.windFetched ? averageWind(activity) : null

  return (
    <div className="flex flex-col flex-1 overflow-hidden pb-14 md:pb-0">
      <div className="relative flex-1">
        <div ref={containerRef} className="w-full h-full" />

        {/* Ambient defaults (SW, 10 km/h) keep the wind streaks alive before any route
            is loaded, so the empty map reads as a wind app rather than a blank canvas */}
        <WindAnimation direction={wind?.direction ?? 225} speed={wind?.speed ?? 10} theme={theme} />

        {compareCount > 0 && (
          <button
            onClick={onOpenCompare}
            title="Ouvrir le comparateur"
            className="absolute bottom-20 md:bottom-4 right-3 z-10 h-9 pl-2.5 pr-3.5 flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-xs font-semibold shadow-lg shadow-[var(--color-accent)]/30"
          >
            🏆 {compareCount}
          </button>
        )}

        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
          className="absolute top-24 right-3 z-10 w-[29px] h-[29px] flex items-center justify-center rounded bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] shadow"
        >
          {theme === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" strokeLinecap="round" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </button>

        {activity && (
          <button
            onClick={handleReverseRoute}
            title="Inverser le sens du parcours"
            className="absolute top-[141px] right-3 z-10 w-[29px] h-[29px] flex items-center justify-center rounded bg-[var(--color-surface-1)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] shadow"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {!activity && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
            <div className="pointer-events-auto bg-[var(--color-surface-2)]/90 backdrop-blur-sm rounded-2xl px-7 py-6 border border-[var(--color-border)] text-center max-w-xs shadow-lg">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-border)] flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-wind-calm)" strokeWidth="2"><path d="M3 12h11a3 3 0 1 0-2.4-4.8M3 17h15a3 3 0 1 1-2.4 4.8M3 7h7" strokeLinecap="round" /></svg>
              </div>
              <p className="text-base font-semibold text-[var(--color-text-primary)]">Prêt à sentir le vent ?</p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1.5">
                Importe un GPX ou connecte Strava — on te dira tout de suite si tu pars face au vent.
              </p>
              <button
                onClick={onOpenSorties}
                className="mt-4 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white rounded-full px-4 py-2 text-sm font-medium shadow"
              >
                Importer un parcours
              </button>
            </div>
          </div>
        )}

        {activity && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 w-[92vw] max-w-md md:w-auto">
            {!activity.windFetched && (
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-1)]/90 backdrop-blur rounded-full px-2.5 py-1 border border-[var(--color-border)]">
                <span className="inline-block w-2.5 h-0.5 rounded-full bg-[var(--color-accent)]" />tracé (vent non chargé)
              </span>
            )}
            <div className="flex flex-wrap items-center justify-center gap-1.5 bg-[var(--color-surface-1)]/95 backdrop-blur rounded-2xl md:rounded-full pl-1 pr-1 py-1 border border-[var(--color-border)] shadow-lg">
              {timeControlsOpen ? (
                <>
                  <button
                    onClick={() => shiftPlannedAt(-30)}
                    disabled={loadingWind}
                    title="-30 min"
                    className="w-6 h-6 flex items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0 disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    type="datetime-local"
                    value={plannedAt}
                    step={1800}
                    min={format(new Date(), DATETIME_LOCAL_FORMAT)}
                    max={format(new Date(Date.now() + MAX_FORECAST_DAYS * 86400000), DATETIME_LOCAL_FORMAT)}
                    onChange={(e) => commitPlannedAt(new Date(e.target.value))}
                    className="bg-transparent text-xs text-[var(--color-text-primary)] outline-none"
                  />
                  <button
                    onClick={() => shiftPlannedAt(30)}
                    disabled={loadingWind}
                    title="+30 min"
                    className="w-6 h-6 flex items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0 disabled:opacity-40"
                  >
                    +
                  </button>
                  <button
                    onClick={() => shiftPlannedAt(60)}
                    disabled={loadingWind}
                    title="+1 heure"
                    className="text-[11px] px-1.5 h-6 flex items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0 disabled:opacity-40"
                  >
                    +1h
                  </button>
                  <button
                    onClick={() => setTimeControlsOpen(false)}
                    title="Fermer"
                    className="w-6 h-6 flex items-center justify-center rounded-full text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] shrink-0"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setTimeControlsOpen(true)}
                  className="flex items-center gap-1 px-3 h-6 rounded-full text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] shrink-0"
                >
                  {format(new Date(plannedAt), 'HH:mm')}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
              <button
                onClick={() => handleLoadWind()}
                disabled={loadingWind}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all shrink-0',
                  loadingWind
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-text-muted)] cursor-wait'
                    : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white shadow shadow-[var(--color-accent)]/30',
                )}
              >
                {loadingWind ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Chargement…</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" strokeLinecap="round" strokeLinejoin="round"/></svg>{activity.windFetched ? 'Recalculer' : 'Charger le vent'}</>
                )}
              </button>
            </div>
            {windError && <p className="mt-1 text-xs text-[var(--color-wind-strong)] text-center">{windError}</p>}
          </div>
        )}

        <WindSummaryBadge activity={activity} />
      </div>

      {activity && <WindForecast activity={activity} selectedTime={new Date(plannedAt)} onSelectTime={commitPlannedAt} />}
    </div>
  )
}
