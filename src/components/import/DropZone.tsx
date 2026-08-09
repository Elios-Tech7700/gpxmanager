import { useCallback, useState } from 'react'
import { parseGpx } from '@/lib/gpx-parser'
import { shiftActivityStart } from '@/lib/schedule'
import { useActivities } from '@/store/activities'
import clsx from 'clsx'

export function DropZone() {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const addActivity = useActivities((s) => s.addActivity)

  const processFiles = useCallback(
    async (files: File[]) => {
      setError(null)
      setImporting(true)
      const gpxFiles = files.filter((f) => f.name.toLowerCase().endsWith('.gpx'))
      if (gpxFiles.length === 0) {
        setError('Aucun fichier .gpx détecté.')
        setImporting(false)
        return
      }
      for (const file of gpxFiles) {
        try {
          const text = await file.text()
          const parsed = parseGpx(text, file.name)
          // Only the route geometry/pacing from the GPX matters — plan the ride for now by default
          const activity = shiftActivityStart(parsed, new Date())
          await addActivity(activity)
        } catch (e) {
          setError(e instanceof Error ? e.message : `Erreur sur ${file.name}`)
        }
      }
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
          'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 scale-[1.01]'
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
          'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
          dragging ? 'bg-[var(--color-accent)]/20' : 'bg-[var(--color-surface-3)]',
        )}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-text-secondary)]">
            <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M7 10l5-5 5 5M12 5v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            {importing ? 'Importation…' : 'Glisse tes fichiers GPX ici'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            ou clique pour sélectionner — Strava, Garmin, Komoot
          </p>
        </div>
      </label>

      {error && (
        <p className="mt-2 text-xs text-[var(--color-wind-strong)] px-1">{error}</p>
      )}
    </div>
  )
}
