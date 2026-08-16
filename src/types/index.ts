export interface GpxPoint {
  lat: number
  lon: number
  ele: number
  time: Date
  // enriched after wind fetch
  windSpeed?: number      // km/h
  windDirection?: number  // degrees (0-360, met convention: from where wind blows)
  windRelative?: WindRelative
  bearing?: number        // cyclist heading at this point, degrees
  speed?: number          // km/h derived from GPS
}

export type WindClass = 'headwind' | 'tailwind' | 'crosswind-favorable' | 'crosswind-unfavorable'

export interface WindRelative {
  angle: number       // -180 to 180, 0 = full headwind
  class: WindClass
  effectiveSpeed: number // component of wind against cyclist direction (km/h)
}

export interface Activity {
  id: string
  name: string
  source: 'upload' | 'strava' | 'garmin' | 'komoot'
  importedAt: Date
  startTime: Date
  endTime: Date
  durationSeconds: number
  distanceMeters: number
  elevationGain: number
  points: GpxPoint[]
  windFetched: boolean
  bounds: [number, number, number, number] // [minLon, minLat, maxLon, maxLat]
  folderId: string | null
  // Stable Strava identifier (e.g. "activity-12345", "route-6789"), set on
  // import — lets a later auto-organize sync recognize this activity without
  // re-fetching it. Undefined for GPX files uploaded directly (no Strava origin).
  stravaId?: string
}

export interface Folder {
  id: string
  name: string
  createdAt: Date
}

export interface WindApiResponse {
  hourly: {
    time: string[]
    wind_speed_10m: number[]
    wind_direction_10m: number[]
  }
}
