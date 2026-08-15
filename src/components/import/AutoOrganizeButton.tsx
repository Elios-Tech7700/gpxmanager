import { useState } from 'react'
import { useFolders } from '@/store/folders'
import { getStoredTokens } from '@/lib/strava-auth'
import { isBucketFolderName } from '@/lib/auto-organize'
import { useAutoOrganize } from '@/hooks/useAutoOrganize'

export function AutoOrganizeButton() {
  const folders = useFolders((s) => s.folders)
  const { progress, run } = useAutoOrganize()
  // Checked once on mount — connecting/disconnecting Strava while this panel
  // stays open (without a page reload) won't update this, same tradeoff
  // StravaImport itself accepts for its own local connection state.
  const [connected] = useState(() => getStoredTokens() !== null)

  const alreadyRan = folders.some((f) => isBucketFolderName(f.name))
  const running = progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error'

  const label = !running
    ? (alreadyRan ? 'Mettre à jour le classement' : 'Organiser automatiquement')
    : progress.phase === 'fetching' ? 'Récupération…'
    : progress.phase === 'importing' ? `Import… (${progress.imported + progress.skipped + progress.failed}/${progress.total})`
    : 'Classement…'

  return (
    <div className="px-4 pb-1">
      <button
        onClick={run}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-70 text-white text-sm font-semibold py-2.5 shadow shadow-[var(--color-accent)]/20 transition-colors"
      >
        {running && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />}
        <span>🗂️ {label}</span>
      </button>

      {!running && progress.phase === 'idle' && !connected && (
        <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)] px-1">
          Connecte Strava pour aussi synchroniser tes activités et itinéraires.
        </p>
      )}

      {progress.phase === 'done' && (
        <p className="mt-1.5 text-[10px] text-[var(--color-wind-calm)] px-1">
          {connected && (
            <>
              {progress.imported} importée{progress.imported === 1 ? '' : 's'}, {progress.skipped} doublon{progress.skipped === 1 ? '' : 's'} ignoré{progress.skipped === 1 ? '' : 's'}
              {', '}
            </>
          )}
          {progress.classified} classée{progress.classified === 1 ? '' : 's'}
          {progress.failed > 0 && <>, {progress.failed} échec{progress.failed === 1 ? '' : 's'}</>}
          .
        </p>
      )}

      {progress.phase === 'error' && progress.error && (
        <p className="mt-1.5 text-[10px] text-[var(--color-wind-strong)] px-1">{progress.error}</p>
      )}
    </div>
  )
}
