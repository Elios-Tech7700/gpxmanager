import maplibregl from 'maplibre-gl'
import { WIND_CLASS_COLOR } from '@/lib/wind-math'
import type { Activity } from '@/types'

export const MAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
} as const
export type MapTheme = keyof typeof MAP_STYLES
export const CASING_COLOR: Record<MapTheme, string> = { dark: '#ffffff', light: '#0f172a' }
export const THEME_STORAGE_KEY = 'gpxmanager-map-theme'

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

export type RouteMarkersRef = { current: { start: maplibregl.Marker | null; end: maplibregl.Marker | null } }

// Redraws the route. Sources/layers are only torn down and rebuilt when they
// don't exist yet (fresh map/style) — a wind recalculation on the SAME route
// (activity.id unchanged) reuses the existing sources via setData(), so it
// doesn't flash-rebuild the whole layer stack or fight the user's zoom.
// `refit` gates fitBounds separately: only pass true when the route itself
// changed, never on a same-route wind recolor.
export function applyRoute(
  map: maplibregl.Map,
  activity: Activity,
  theme: MapTheme,
  markersRef: RouteMarkersRef,
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
