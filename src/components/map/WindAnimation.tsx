import { useEffect, useRef } from 'react'
import { windColor } from '@/lib/wind-math'

interface Props {
  direction: number | null // met convention (FROM), degrees
  speed: number // km/h
  theme: 'dark' | 'light'
}

const PARTICLE_COUNT = 60
const TRAIL_LENGTH = 22

interface Particle {
  x: number
  y: number
}

export function WindAnimation({ direction, speed, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const sizeRef = useRef({ width: 0, height: 0 })

  // Sizing lives in its own effect, keyed only to actual layout changes — a
  // ResizeObserver on the canvas itself (not window.resize) also catches panel
  // mount/collapse, which changes the map's on-screen size without a window resize.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = (canvas.width = rect.width * dpr)
      const height = (canvas.height = rect.height * dpr)
      sizeRef.current = { width, height }
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
      }))
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // Direction/speed/theme changes only affect how the SAME particles are drawn
  // and steered from here on — they no longer get reseeded (teleported) every
  // time a wind recalculation runs, which is unrelated to canvas size.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || direction === null) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1

    // Direction the wind blows TOWARD (met convention gives the FROM direction).
    // North is "up" on the map, so dy is negative for a northward component.
    const angleRad = (((direction + 180) % 360) * Math.PI) / 180
    const dx = Math.sin(angleRad)
    const dy = -Math.cos(angleRad)
    const speedPx = Math.max(0.5, Math.min(3.5, speed / 12)) * dpr
    const trail = TRAIL_LENGTH * dpr
    const color = windColor(speed)
    // A casing stroke (opposite of the map theme) keeps the streaks legible
    // regardless of whether the base map tiles are light or dark
    const casing = theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.35)'

    let raf: number
    const tick = () => {
      const { width, height } = sizeRef.current
      ctx.clearRect(0, 0, width, height)
      ctx.lineCap = 'round'

      for (const p of particlesRef.current) {
        p.x += dx * speedPx
        p.y += dy * speedPx
        if (p.x < -trail) p.x = width + trail
        if (p.x > width + trail) p.x = -trail
        if (p.y < -trail) p.y = height + trail
        if (p.y > height + trail) p.y = -trail

        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - dx * trail, p.y - dy * trail)

        ctx.strokeStyle = casing
        ctx.lineWidth = 3 * dpr
        ctx.stroke()

        ctx.strokeStyle = color
        ctx.lineWidth = 1.5 * dpr
        ctx.stroke()
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(raf)
  }, [direction, speed, theme])

  if (direction === null) return null

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-[5]" />
}
