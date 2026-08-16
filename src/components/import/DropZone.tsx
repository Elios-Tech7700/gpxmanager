import { useCallback, useState } from 'react'
import { parseGpx } from '@/lib/gpx-parser'
import { shiftActivityStart } from '@/lib/schedule'
import { isNearDuplicate } from '@/lib/auto-organize'
import { useActivities } from '@/store/activities'
import clsx from 'clsx'

export function DropZone() {
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hasFailure, setHasFailure] = useState(false)
  const [importing, setImporting] = useState(false)
  const addActivity = useActivities((s) => s.addActivity)

  const processFiles = useCallback(
    async (files: File[]) => {
      setMessage(null)
      setHasFailure(false)
      setImporting(true)
      const gpxFiles = files.filter((f) => f.name.toLowerCase().endsWith('.gpx'))
      if (gpxFiles.length === 0) {
        setMessage('Aucun fichier .gpx détecté.')
        setHasFailure(true)
        setImporting(false)
        return
      }

      // Seeded from the store, then extended locally as files import — catches
      // a duplicate against activities already saved AND against another file
      // in this same drop (e.g. the same GPX dragged in twice at once). Matched
      // by start/end proximity + distance, not an exact hash — a GPX recorder
      // never starts/stops at the exact same spot twice for "the same" ride.
      const knownActivities = [...useActivities.getState().activities]

      let imported = 0
      let duplicates = 0
      const failures: string[] = []

      for (const file of gpxFiles) {
        try {
          const text = await file.text()
          const parsed = parseGpx(text, file.name)
          if (knownActivities.some((existing) => isNearDuplicate(existing, parsed))) {
            duplicates++
            continue
          }
          // Only the route geometry/pacing from the GPX matters — plan the ride for now by default
          const activity = shiftActivityStart(parsed, new Date())
          await addActivity(activity)
          knownActivities.push(activity)
          imported++
        } catch (e) {
          failures.push(`${file.name} : ${e instanceof Error ? e.message : 'erreur inconnue'}`)
        }
      }

      const parts: string[] = []
      if (imported > 0) parts.push(`${imported} importée${imported === 1 ? '' : 's'}`)
      if (duplicates > 0) parts.push(`${duplicates} déjà présente${duplicates === 1 ? '' : 's'} (ignorée${duplicates === 1 ? '' : 's'})`)
      if (failures.length > 0) parts.push(`${failures.length} en échec — ${failures.join(' · ')}`)
      setMessage(parts.length > 0 ? `${parts.join(', ')}.` : null)
      setHasFailure(failures.length > 0)

      setImporting(false)
    },
    [addActivity],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      processFiles(Array.from(e.dataTransfer.files))
    },
    [processFiles],
  )

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(Array.from(e.target.files ?? []))
      e.target.value = ''
    },
    [processFiles],
  )

  return (
    <div className="p-4">
      <label
        className={clsx(
          // Mobile: a compact single-row bar — dragging a file onto a phone isn't a
          // real gesture, so the illustrated drop zone only makes sense from md up.
          'relative flex items-center justify-center gap-3 rounded-xl cursor-pointer transition-all duration-200',
          'px-4 py-3 border md:flex-col md:p-10 md:border-2 md:border-dashed',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 md:scale-[1.01]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-text-muted)]',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".gpx"
          multiple
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={onFileInput}
        />

        <div className={clsx(
          'shrink-0 w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors',
          dragging ? 'bg-[var(--color-accent)]/20' : 'bg-[var(--color-surface-3)]',
        )}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-text-secondary)] md:hidden">
            <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M7 10l5-5 5 5M12 5v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-text-secondary)] hidden md:block">
            <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M7 10l5-5 5 5M12 5v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="text-center min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            <span className="md:hidden">{importing ? 'Importation…' : 'Importer un GPX'}</span>
            <span className="hidden md:inline">{importing ? 'Importation…' : 'Glisse tes fichiers GPX ici'}</span>
          </p>
          <p className="hidden md:block text-xs text-[var(--color-text-muted)] mt-1">
            ou clique pour sélectionner — Strava, Garmin, Komoot
          </p>
        </div>
      </label>

      {message && (
        <p className={clsx('mt-2 text-xs px-1', hasFailure ? 'text-[var(--color-wind-strong)]' : 'text-[var(--color-text-secondary)]')}>
          {message}
        </p>
      )}
    </div>
  )
}
