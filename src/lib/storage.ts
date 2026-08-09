import { openDB, type IDBPDatabase } from 'idb'
import type { Activity, Folder } from '@/types'

const DB_NAME = 'gpxmanager'
const DB_VERSION = 2
const ACTIVITIES_STORE = 'activities'
const FOLDERS_STORE = 'folders'

let db: IDBPDatabase | null = null

async function getDb() {
  if (!db) {
    db = await openDB(DB_NAME, DB_VERSION, {
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
  }
  return db
}

// IDB doesn't handle Date objects in complex structures well — serialize/deserialize
function serialize(activity: Activity): object {
  return JSON.parse(JSON.stringify(activity))
}

function deserialize(raw: Record<string, unknown>): Activity {
  const points = (raw.points as Record<string, unknown>[]).map((p) => ({
    ...p,
    time: new Date(p.time as string),
  }))
  return {
    ...(raw as Omit<Activity, 'points' | 'importedAt' | 'startTime' | 'endTime' | 'folderId' | 'shortlisted'>),
    points,
    importedAt: new Date(raw.importedAt as string),
    startTime: new Date(raw.startTime as string),
    endTime: new Date(raw.endTime as string),
    folderId: (raw.folderId as string | null | undefined) ?? null,
    shortlisted: (raw.shortlisted as boolean | undefined) ?? false,
  } as Activity
}

export async function saveActivity(activity: Activity): Promise<void> {
  const db = await getDb()
  await db.put(ACTIVITIES_STORE, serialize(activity))
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

function serializeFolder(folder: Folder): object {
  return JSON.parse(JSON.stringify(folder))
}

function deserializeFolder(raw: Record<string, unknown>): Folder {
  return {
    ...(raw as Omit<Folder, 'createdAt'>),
    createdAt: new Date(raw.createdAt as string),
  } as Folder
}

export async function saveFolder(folder: Folder): Promise<void> {
  const db = await getDb()
  await db.put(FOLDERS_STORE, serializeFolder(folder))
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
