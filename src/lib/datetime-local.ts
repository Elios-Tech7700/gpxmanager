import { format } from 'date-fns'

// Shared by every <input type="datetime-local"> in the app (map time picker,
// comparator target time) so the format string and forecast horizon can't
// drift apart between them.
export const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm"
export const MAX_FORECAST_DAYS = 15

export function toDatetimeLocalValue(date: Date): string {
  return format(date, DATETIME_LOCAL_FORMAT)
}

// min/max bounds for a datetime-local input scoped to what Open-Meteo can
// actually forecast — from now up to MAX_FORECAST_DAYS out.
export function datetimeLocalBounds(): { min: string; max: string } {
  return {
    min: toDatetimeLocalValue(new Date()),
    max: toDatetimeLocalValue(new Date(Date.now() + MAX_FORECAST_DAYS * 86400000)),
  }
}
