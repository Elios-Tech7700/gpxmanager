import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MapView } from '@/components/map/MapView'
import { useActivities } from '@/store/activities'
import { useFolders } from '@/store/folders'

export default function App() {
  const init = useActivities((s) => s.init)
  const loading = useActivities((s) => s.loading)
  const initFolders = useFolders((s) => s.init)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { init() }, [init])
  useEffect(() => { initFolders() }, [initFolders])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface-0)]">
        <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full bg-[var(--color-surface-0)] overflow-hidden">
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MapView onOpenSidebar={() => setSidebarOpen(true)} />
      </main>
    </div>
  )
}
