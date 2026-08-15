import { useSyncExternalStore } from 'react'

// Presentation-only signal (desktop flyout vs mobile overlay/sheet) — never use
// this to decide WHICH panel is open, only how the currently-open one is drawn.
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', callback)
    return () => mql.removeEventListener('change', callback)
  }
  const getSnapshot = () => window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
