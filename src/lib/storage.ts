import { openDB, type IDBPDatabase } from 'idb'
import type { Activity, Folder } from '@/types'

const DB_NAME = 'gpxmanager'
const DB_VERSION = 2
const ACTIVITIES_STORE = 'activities'
const FOLDERS_STORE = 'folders'

// Cache the in-flight promise, not the resolved connection — two callers
// racing before the first openDB() settles (e.g. activities.init() and
// folders.init() firing on the same tick from App.tsx) would otherwise each
// start their own openDB(), and the second can block behind the first's
// version-upgrade transaction.
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Guard existence checks so a v1 -> v2 upgrade (which re-runs this whole
      // callback, not just the new version's delta) doesn't try to recreate
      // the already-existing activities store and crash the migration.
      if (!database.objectStoreNames.contains(ACTIVITIES_STORE)) {
        database.createObjectStore(ACTIVITIES_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(FOLDERS_STORE)) {
        database.createObjectStore(FOLDERS_STORE, { keyPath: 'id' })
      }
    },
  })
  return dbPromise
}

// IndexedDB's structured clone handles Date natively, so activities/folders are
// stored as-is. Records written before this change were round-tripped through
// JSON (dates as strings) — deserialize below accepts either shape, since
// `new Date(x)` works whether `x` is an ISO string or already a Date instance.
function deserialize(raw: Record<string, unknown>): Activity {
  const points = (raw.points as Record<string, unknown>[]).map((p) => ({
    ...p,
    time: new Date(p.time as string),
  }))
  return {
    ...(raw as Omit<Activity, 'points' | 'importedAt' | 'startTime' | 'endTime' | 'folderId'>),
    points,
    importedAt: new Date(raw.importedAt as string),
    startTime: new Date(raw.startTime as string),
    endTime: new Date(raw.endTime as string),
    folderId: (raw.folderId as string | null | undefined) ?? null,
  } as Activity
}

export async function saveActivity(activity: Activity): Promise<void> {
  const db = await getDb()
  await db.put(ACTIVITIES_STORE, activity)
}

export async function loadActivities(): Promise<Activity[]> {
  const db = await getDb()
  const all = await db.getAll(ACTIVITIES_STORE)
  return all.map(deserialize)
}

export async function deleteActivity(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(ACTIVITIES_STORE, id)
}

function deserializeFolder(raw: Record<string, unknown>): Folder {
  return {
    ...(raw as Omit<Folder, 'createdAt'>),
    createdAt: new Date(raw.createdAt as string),
  } as Folder
}

export async function saveFolder(folder: Folder): Promise<void> {
  const db = await getDb()
  await db.put(FOLDERS_STORE, folder)
}

export async function loadFolders(): Promise<Folder[]> {
  const db = await getDb()
  const all = await db.getAll(FOLDERS_STORE)
  return all.map(deserializeFolder)
}

export async function deleteFolderRecord(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(FOLDERS_STORE, id)
}
