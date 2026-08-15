import { useEffect, useState } from 'react'
import { NavRail } from '@/components/layout/NavRail'
import { FlyoutPanel } from '@/components/layout/FlyoutPanel'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { SortiesPanel } from '@/components/layout/SortiesPanel'
import { CompareSection } from '@/components/compare/CompareSection'
import { MapView } from '@/components/map/MapView'
import { useActivities } from '@/store/activities'
import { useFolders } from '@/store/folders'
import { useCompareFilter, getCompareCandidates } from '@/store/compareFilter'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useShallow } from 'zustand/shallow'

type Panel = 'sorties' | 'comparer'
// Only meaningful for 'comparer' on mobile: the FAB on the map opens a partial
// bottom sheet (map stays visible behind it), the tab bar opens a full screen.
type MobilePresentation = 'sheet' | 'overlay'

export default function App() {
  const init = useActivities((s) => s.init)
  const loading = useActivities((s) => s.loading)
  const activitiesError = useActivities((s) => s.error)
  const activities = useActivities((s) => s.activities)
  const setActive = useActivities((s) => s.setActive)
  const cleanOrphanedFolderRefs = useActivities((s) => s.cleanOrphanedFolderRefs)
  const initFolders = useFolders((s) => s.init)
  const foldersLoading = useFolders((s) => s.loading)
  const foldersError = useFolders((s) => s.error)
  const folders = useFolders((s) => s.folders)
  const { selectedFolderIds, includeUnfiled } = useCompareFilter(
    useShallow((s) => ({ selectedFolderIds: s.selectedFolderIds, includeUnfiled: s.includeUnfiled })),
  )

  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Single source of truth for "which panel is open" — the flyout (desktop),
  // full-screen overlay (mobile) and bottom sheet (mobile) below are three
  // presentations of THIS one state, never three states written in parallel.
  // Only one of them ever mounts SortiesPanel/CompareSection at a time.
  const [activePanel, setActivePanel] = useState<Panel | null>(null)
  const [mobilePresentation, setMobilePresentation] = useState<MobilePresentation>('overlay')

  useEffect(() => { init() }, [init])
  useEffect(() => { initFolders() }, [initFolders])

  // Safety net: forces orphaned folder references (activities pointing at a
  // deleted folder) back to unfiled once both stores have finished loading.
  useEffect(() => {
    if (loading || foldersLoading) return
    cleanOrphanedFolderRefs(new Set(folders.map((f) => f.id)))
  }, [loading, foldersLoading, folders, cleanOrphanedFolderRefs])

  const compareCount = getCompareCandidates(activities, selectedFolderIds, includeUnfiled).length

  const togglePanel = (panel: Panel) => {
    setMobilePresentation('overlay')
    setActivePanel((cur) => (cur === panel ? null : panel))
  }
  const openSorties = () => { setMobilePresentation('overlay'); setActivePanel('sorties') }
  const openCompareAsSheet = () => { setMobilePresentation('sheet'); setActivePanel('comparer') }
  const closePanel = () => setActivePanel(null)
  const changeMobileTab = (tab: Panel | 'carte') => {
    if (tab === 'carte') { setActivePanel(null); return }
    setMobilePresentation('overlay')
    setActivePanel(tab)
  }
  const selectActivity = async (id: string) => {
    setActive(id)
    setActivePanel(null)
  }

  if (loading || foldersLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface-0)]">
        <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
      </div>
    )
  }

  const loadError = activitiesError ?? foldersError
  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-[var(--color-surface-0)] px-6 text-center">
        <p className="text-sm text-[var(--color-text-primary)]">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-surface-0)] font-medium"
        >
          Recharger
        </button>
      </div>
    )
  }

  const panelTitle = activePanel === 'sorties' ? 'Sorties' : 'Comparateur vent'
  const panelBody = activePanel === 'sorties'
    ? <SortiesPanel onSelectActivity={closePanel} />
    : <CompareSection onSelect={selectActivity} />

  return (
    <div className="flex h-full bg-[var(--color-surface-0)] overflow-hidden">
      <NavRail activePanel={activePanel} onToggle={togglePanel} compareCount={compareCount} />

      {isDesktop && activePanel && (
        <FlyoutPanel title={panelTitle} onClose={closePanel}>
          {panelBody}
        </FlyoutPanel>
      )}

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MapView onOpenSorties={openSorties} onOpenCompare={openCompareAsSheet} compareCount={compareCount} />
      </main>

      {!isDesktop && activePanel && mobilePresentation === 'overlay' && (
        <div className="fixed inset-0 bottom-14 z-30 bg-[var(--color-surface-1)] flex flex-col">
          <div className="shrink-0 px-4 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">{panelTitle}</h1>
            <button
              onClick={closePanel}
              className="w-9 h-9 -m-2 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">{panelBody}</div>
        </div>
      )}

      {!isDesktop && activePanel === 'comparer' && mobilePresentation === 'sheet' && (
        <div className="fixed inset-x-0 bottom-14 z-30 max-h-[58vh] overflow-y-auto rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-2xl">
          <div className="sticky top-0 bg-[var(--color-surface-1)] flex flex-col items-center pt-2 pb-1">
            <button onClick={closePanel} className="w-9 h-1 rounded-full bg-[var(--color-border)]" aria-label="Fermer" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mt-2">Comparateur vent</h2>
          </div>
          <CompareSection onSelect={selectActivity} />
        </div>
      )}

      <MobileTabBar active={activePanel ?? 'carte'} onChange={changeMobileTab} compareCount={compareCount} />
    </div>
  )
}
