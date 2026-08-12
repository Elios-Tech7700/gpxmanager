import { useEffect, useMemo, useRef, useState } from 'react'
import { format, isSameDay, startOfDay, startOfHour } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Activity, WindClass } from '@/types'
import { fetchWindForecast, type DaylightWindow } from '@/lib/wind-api'
import { computeRelativeWind, windClassLabel, WIND_CLASS_COLOR, estimateWindEffort } from '@/lib/wind-math'
import clsx from 'clsx'

interface ForecastHour {
  time: Date
  speed: number
  direction: number
  class: WindClass
  effectiveSpeed: number
}

interface Props {
  activity: Activity
  selectedTime: Date
  onSelectTime: (date: Date) => void
}

const HOUR_WIDTH = 18
const PILL_ZONE = 13
const ARROW_ZONE = 13
const CHART_HEIGHT = 46
const TICK_H = 5
const LABEL_H = 12

const ARROW_Y = PILL_ZONE
const CHART_TOP = PILL_ZONE + ARROW_ZONE
const BASELINE_Y = CHART_TOP + CHART_HEIGHT
const TOTAL_HEIGHT = BASELINE_Y + TICK_H + LABEL_H

// Quadratic-midpoint smoothing — cheap way to turn a jagged hourly polyline
// into a flowing curve without pulling in a charting library.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]
    const p1 = points[i]
    const mx = (p0.x + p1.x) / 2
    const my = (p0.y + p1.y) / 2
    d += ` Q ${p0.x} ${p0.y} ${mx} ${my}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

export function WindForecast({ activity, selectedTime, onSelectTime }: Props) {
  const [hours, setHours] = useState<ForecastHour[] | null>(null)
  const [daylight, setDaylight] = useState<DaylightWindow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoverHour, setHoverHour] = useState<ForecastHour | null>(null)
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const bearing = activity.points[0]?.bearing ?? 0

  useEffect(() => {
    let cancelled = false
    setHours(null)
    setDaylight(null)
    setError(null)
    setHoverHour(null)

    fetchWindForecast(activity)
      .then(({ hours: data, daylight: daylightData }) => {
        if (cancelled) return
        const cutoff = startOfHour(new Date())
        setHours(
          data
            .filter((d) => d.time >= cutoff)
            .map((d) => {
              const rel = computeRelativeWind(d.direction, bearing, d.speed)
              return { ...d, class: rel.class, effectiveSpeed: rel.effectiveSpeed }
            }),
        )
        setDaylight(daylightData)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur prévision vent')
      })

    return () => {
      cancelled = true
    }
  }, [activity.id, bearing])

  const startTime = hours?.[0]?.time
  const maxSpeed = useMemo(() => Math.max(...(hours ?? []).map((h) => h.speed), 1), [hours])

  const xForTime = (t: Date) => (startTime ? ((t.getTime() - startTime.getTime()) / 3600000) * HOUR_WIDTH : 0)
  const yForSpeed = (speed: number) => BASELINE_Y - (speed / maxSpeed) * (CHART_HEIGHT - 4)

  const totalWidth = hours && hours.length > 0 ? xForTime(hours[hours.length - 1].time) + HOUR_WIDTH : 0

  const nearestHourAt = (chartX: number): ForecastHour | null => {
    if (!hours || !startTime) return null
    const idx = Math.round(chartX / HOUR_WIDTH)
    return hours[Math.max(0, Math.min(hours.length - 1, idx))]
  }

  const selectedHour = hours ? nearestHourAt(xForTime(selectedTime)) : null

  // Keep the current selection in view when it changes from outside (e.g. the +1h/-30min buttons)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !hours || !startTime) return
    const x = xForTime(selectedTime)
    if (x < el.scrollLeft + 30 || x > el.scrollLeft + el.clientWidth - 30) {
      el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' })
    }
  }, [selectedTime.getTime(), hours])

  const scrollByDay = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * HOUR_WIDTH * 24, behavior: 'smooth' })
  }

  // Best remaining slot today, restricted to real sunrise/sunset (no point suggesting
  // 22h). Scoped to "today" for now; extending to the full week later just means
  // passing a different filter into this same reduction.
  const bestToday = useMemo(() => {
    if (!hours) return null
    const todayDaylight = daylight?.find((d) => d.date === format(new Date(), 'yyyy-MM-dd'))
    const todayHours = hours.filter((h) => {
      if (!isSameDay(h.time, new Date())) return false
      if (!todayDaylight) return true
      return h.time >= todayDaylight.sunrise && h.time <= todayDaylight.sunset
    })
    if (!todayHours.length) return null
    let best = todayHours[0]
    let bestScore = estimateWindEffort(activity, best.direction, best.speed)
    for (const h of todayHours.slice(1)) {
      const score = estimateWindEffort(activity, h.direction, h.speed)
      if (score < bestScore) {
        best = h
        bestScore = score
      }
    }
    return { hour: best, score: bestScore }
  }, [hours, daylight, activity])

  if (error) {
    return (
      <div className="bg-[var(--color-surface-1)] border-t border-[var(--color-border)] px-4 py-3">
        <p className="text-xs text-[var(--color-wind-strong)]">{error}</p>
      </div>
    )
  }

  if (!hours || !startTime) {
    return (
      <div className="bg-[var(--color-surface-1)] border-t border-[var(--color-border)] px-4 py-3">
        <div className="h-16 rounded bg-[var(--color-surface-2)] animate-pulse" />
      </div>
    )
  }

  const readout = hoverHour ?? selectedHour

  const linePoints = hours.map((h) => ({ x: xForTime(h.time), y: yForSpeed(h.speed) }))
  const linePath = smoothPath(linePoints)
  const areaPath = `${linePath} L ${linePoints[linePoints.length - 1].x} ${BASELINE_Y} L ${linePoints[0].x} ${BASELINE_Y} Z`

  const dayStarts: { time: Date; x: number }[] = []
  let cursor = startOfDay(hours[hours.length - 1].time)
  while (cursor > hours[0].time) {
    if (cursor > startTime) dayStarts.push({ time: cursor, x: xForTime(cursor) })
    cursor = startOfDay(new Date(cursor.getTime() - 86400000))
  }

  const hourTicks = hours.filter((h) => h.time.getHours() % 3 === 0 && h.time.getHours() !== 0)

  const handlePointer = (e: React.MouseEvent<SVGSVGElement>, commit: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const chartX = e.clientX - rect.left
    const hour = nearestHourAt(chartX)
    if (!hour) return
    if (commit) onSelectTime(hour.time)
    else setHoverHour(hour)
  }

  const pillX = (x: number, width: number) => Math.max(0, Math.min(totalWidth - width, x - width / 2))

  return (
    <div className="bg-[var(--color-surface-1)] border-t border-[var(--color-border)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
      >
        <svg
          className={clsx('shrink-0 text-[var(--color-text-muted)] transition-transform', expanded && 'rotate-180')}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wider shrink-0">Prévisions</p>
        {readout && (
          <p className="text-xs text-[var(--color-text-secondary)] truncate">
            <span style={{ color: WIND_CLASS_COLOR[readout.class] }} className="font-medium">
              {Math.round(readout.speed)} km/h, {windClassLabel(readout.class).toLowerCase()}
            </span>
          </p>
        )}
      </button>

      {expanded && (
      <div className="px-4 pb-3">
      {readout && (
        <p className="text-xs text-[var(--color-text-secondary)] capitalize mb-1.5">
          {format(readout.time, "EEEE d MMM, HH'h'", { locale: fr })}
        </p>
      )}

      {bestToday && (
        bestToday.hour.time.getTime() === selectedHour?.time.getTime() ? (
          <p className="text-[11px] text-[var(--color-text-muted)] mb-1.5">✓ Tu es déjà sur le meilleur créneau du jour</p>
        ) : (
          <button
            onClick={() => onSelectTime(bestToday.hour.time)}
            className="flex items-center gap-1.5 text-[11px] text-[var(--color-accent-hover)] hover:text-[var(--color-text-primary)] mb-1.5"
          >
            <span>☀</span>
            Meilleur créneau aujourd'hui : {format(bestToday.hour.time, 'HH')}h · effort vent {bestToday.score}/100
          </button>
        )
      )}

      <div className="relative flex items-center gap-1">
        <button
          onClick={() => scrollByDay(-1)}
          title="Jour précédent"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)]"
        >
          ‹
        </button>

        <div ref={scrollRef} className="flex-1 overflow-x-auto [scrollbar-width:thin]">
          <svg
            width={totalWidth}
            height={TOTAL_HEIGHT}
            className="block cursor-pointer"
            onMouseMove={(e) => handlePointer(e, false)}
            onMouseLeave={() => setHoverHour(null)}
            onClick={(e) => handlePointer(e, true)}
          >
            {/* 3h ticks + hour labels — orientation ruler */}
            {hourTicks.map((h) => {
              const x = xForTime(h.time)
              const showLabel = h.time.getHours() % 6 === 0
              return (
                <g key={h.time.toISOString()}>
                  <line x1={x} y1={BASELINE_Y} x2={x} y2={BASELINE_Y + TICK_H} stroke="var(--color-border)" strokeWidth="1" />
                  {showLabel && (
                    <text x={x} y={BASELINE_Y + TICK_H + LABEL_H - 2} fontSize="8" textAnchor="middle" fill="var(--color-text-muted)">
                      {format(h.time, 'HH')}h
                    </text>
                  )}
                </g>
              )
            })}

            {/* Day boundaries */}
            {dayStarts.map(({ time, x }) => (
              <g key={time.toISOString()}>
                <line x1={x} y1={CHART_TOP} x2={x} y2={BASELINE_Y} stroke="var(--color-text-muted)" strokeWidth="1" opacity="0.4" />
                <line x1={x} y1={BASELINE_Y} x2={x} y2={BASELINE_Y + TICK_H} stroke="var(--color-text-muted)" strokeWidth="1" />
                <text x={x + 3} y={BASELINE_Y + TICK_H + LABEL_H - 2} fontSize="9" fontWeight="600" fill="var(--color-text-secondary)" className="capitalize">
                  {format(time, 'EEE d', { locale: fr })}
                </text>
              </g>
            ))}

            <path d={areaPath} fill="var(--color-accent)" opacity="0.12" />
            <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />

            {hours
              .filter((h) => h.time.getHours() % 3 === 0)
              .map((h) => {
                const x = xForTime(h.time)
                const rotation = (h.direction + 180) % 360
                return (
                  <g key={h.time.toISOString()} transform={`translate(${x}, ${ARROW_Y + ARROW_ZONE / 2}) rotate(${rotation})`} opacity="0.9">
                    <path d="M0 -5 L3 4 L0 2 L-3 4 Z" fill={WIND_CLASS_COLOR[h.class]} />
                  </g>
                )
              })}

            {/* Live hover crosshair — shows exactly where a click will land */}
            {hoverHour && hoverHour !== selectedHour && (
              <g>
                <line
                  x1={xForTime(hoverHour.time)}
                  y1={ARROW_Y}
                  x2={xForTime(hoverHour.time)}
                  y2={BASELINE_Y}
                  stroke="var(--color-text-secondary)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  opacity="0.6"
                />
                <circle cx={xForTime(hoverHour.time)} cy={yForSpeed(hoverHour.speed)} r="3" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" />
              </g>
            )}

            {/* Best remaining slot today — gold marker, distinct from the accent selection and the grey hover crosshair */}
            {bestToday && bestToday.hour.time.getTime() !== selectedHour?.time.getTime() && (
              <circle
                cx={xForTime(bestToday.hour.time)}
                cy={yForSpeed(bestToday.hour.speed)}
                r="4"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2"
              />
            )}

            {/* Committed selection — solid line + pill anchored at the top so it never gets lost */}
            {selectedHour && (
              <g>
                <line
                  x1={xForTime(selectedHour.time)}
                  y1={PILL_ZONE}
                  x2={xForTime(selectedHour.time)}
                  y2={BASELINE_Y}
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                  opacity="0.7"
                />
                <circle cx={xForTime(selectedHour.time)} cy={yForSpeed(selectedHour.speed)} r="4" fill="var(--color-accent)" stroke="var(--color-surface-1)" strokeWidth="1.5" />
                <g transform={`translate(${pillX(xForTime(selectedHour.time), 28)}, 0)`}>
                  <rect width="28" height="12" rx="6" fill="var(--color-accent)" />
                  <text x="14" y="9" fontSize="8" fontWeight="600" textAnchor="middle" fill="white">
                    {format(selectedHour.time, 'HH')}h
                  </text>
                </g>
              </g>
            )}
          </svg>
        </div>

        <button
          onClick={() => scrollByDay(1)}
          title="Jour suivant"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)]"
        >
          ›
        </button>
      </div>
      </div>
      )}
    </div>
  )
}
