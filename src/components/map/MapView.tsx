import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useActiveActivity, useActivities } from '@/store/activities'
import { enrichActivityWithWind, averageWind } from '@/lib/wind-math'
import { shiftActivityStart, roundUpToHalfHour } from '@/lib/schedule'
import { reverseActivity } from '@/lib/gpx-parser'
import { toDatetimeLocalValue } from '@/lib/datetime-local'
import { WindForecast } from '@/components/timeline/WindForecast'
import { WindAnimation } from '@/components/map/WindAnimation'
import { WindSummaryBadge } from '@/components/map/WindSummaryBadge'
import { TimeControls } from '@/components/map/TimeControls'
import { applyRoute, MAP_STYLES, THEME_STORAGE_KEY, type MapTheme, type RouteMarkersRef } from '@/components/map/mapRoute'
import type { Activity } from '@/types'

export function MapView({ onOpenSorties, onOpenCompare, compareCount }: {
  onOpenSorties: () => void
  onOpenCompare: () => void
  compareCount: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const pendingActivityRef = useRef<Activity | null>(null)
  const routeMarkersRef: RouteMarkersRef = useRef({ start: null, end: null })
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
  const [plannedAt, setPlannedAt] = useState(() => toDatetimeLocalValue(new Date()))
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
      setPlannedAt(toDatetimeLocalValue(activity.startTime))
    } else {
      const target = roundUpToHalfHour(new Date())
      setPlannedAt(toDatetimeLocalValue(target))
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
    setPlannedAt(toDatetimeLocalValue(target))
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
          <TimeControls
            plannedAt={plannedAt}
            windFetched={activity.windFetched}
            loading={loadingWind}
            error={windError}
            onCommit={commitPlannedAt}
            onShift={shiftPlannedAt}
            onLoadWind={() => handleLoadWind()}
          />
        )}

        <WindSummaryBadge activity={activity} />
      </div>

      {activity && <WindForecast activity={activity} selectedTime={new Date(plannedAt)} onSelectTime={commitPlannedAt} />}
    </div>
  )
}
