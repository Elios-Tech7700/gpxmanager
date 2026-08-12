import { useEffect, useState } from 'react'
import { NavRail } from '@/components/layout/NavRail'
import { FlyoutPanel } from '@/components/layout/FlyoutPanel'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { SortiesPanel } from '@/components/layout/SortiesPanel'
import { CompareSection } from '@/components/compare/CompareSection'
import { MapView } from '@/components/map/MapView'
import { useActivities } from '@/store/activities'
import { useFolders } from '@/store/folders'

type Panel = 'sorties' | 'comparer'
type MobileTab = 'carte' | 'sorties' | 'comparer'

export default function App() {
  const init = useActivities((s) => s.init)
  const loading = useActivities((s) => s.loading)
  const activities = useActivities((s) => s.activities)
  const setActive = useActivities((s) => s.setActive)
  const initFolders = useFolders((s) => s.init)

  const [activePanel, setActivePanel] = useState<Panel | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('carte')
  const [compareSheetOpen, setCompareSheetOpen] = useState(false)

  useEffect(() => { init() }, [init])
  useEffect(() => { initFolders() }, [initFolders])

  const shortlistedCount = activities.filter((a) => a.shortlisted).length

  const togglePanel = (panel: Panel) => setActivePanel((cur) => (cur === panel ? null : panel))
  const openSortiesEverywhere = () => { setActivePanel('sorties'); setMobileTab('sorties') }
  const openCompareEverywhere = () => { setActivePanel('comparer'); setCompareSheetOpen(true) }
  const changeMobileTab = (tab: MobileTab) => {
    if (tab === 'carte') setCompareSheetOpen(false)
    setMobileTab(tab)
  }
  const selectActivity = (id: string) => {
    setActive(id)
    setActivePanel(null)
    setMobileTab('carte')
    setCompareSheetOpen(false)
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface-0)]">
        <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full bg-[var(--color-surface-0)] overflow-hidden">
      <NavRail activePanel={activePanel} onToggle={togglePanel} shortlistedCount={shortlistedCount} />

      {activePanel && (
        <FlyoutPanel title={activePanel === 'sorties' ? 'Sorties' : 'Comparateur vent'} onClose={() => setActivePanel(null)}>
          {activePanel === 'sorties' ? (
            <SortiesPanel onSelectActivity={() => setActivePanel(null)} />
          ) : (
            <CompareSection onSelect={selectActivity} />
          )}
        </FlyoutPanel>
      )}

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MapView onOpenSorties={openSortiesEverywhere} onOpenCompare={openCompareEverywhere} shortlistedCount={shortlistedCount} />
      </main>

      {mobileTab !== 'carte' && (
        <div className="md:hidden fixed inset-0 bottom-14 z-30 bg-[var(--color-surface-1)] flex flex-col">
          <div className="shrink-0 px-4 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {mobileTab === 'sorties' ? 'Sorties' : 'Comparateur vent'}
            </h1>
            <button
              onClick={() => setMobileTab('carte')}
              className="w-9 h-9 -m-2 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {mobileTab === 'sorties' ? (
              <SortiesPanel onSelectActivity={() => setMobileTab('carte')} />
            ) : (
              <CompareSection onSelect={selectActivity} />
            )}
          </div>
        </div>
      )}

      {compareSheetOpen && (
        <div className="md:hidden fixed inset-x-0 bottom-14 z-30 max-h-[58vh] overflow-y-auto rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-2xl">
          <div className="sticky top-0 bg-[var(--color-surface-1)] flex items-center justify-center pt-2 pb-1">
            <span className="w-9 h-1 rounded-full bg-[var(--color-border)]" />
          </div>
          <CompareSection onSelect={selectActivity} />
        </div>
      )}

      <MobileTabBar active={mobileTab} onChange={changeMobileTab} shortlistedCount={shortlistedCount} />
    </div>
  )
}
