/**
 * The default store: projects in IndexedDB.
 *
 * Two object stores keep the list cheap. `summaries` holds one small record per project so
 * the dashboard never loads a project to render a card; `files` holds the file map, read
 * only when a project is opened.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import {
  newProjectId,
  type ProjectFiles,
  type ProjectStore,
  type ProjectSummary,
  type SaveMeta,
  StorageError,
} from './types'

const DB_NAME = 'agent-blueprint'
const DB_VERSION = 1

interface BlueprintDb extends DBSchema {
  summaries: { key: string; value: ProjectSummary }
  files: { key: string; value: ProjectFiles }
  /** Directory handles granted by the user, for the File System Access store. */
  handles: { key: string; value: { id: string; name: string; handle: unknown } }
}

let database: Promise<IDBPDatabase<BlueprintDb>> | undefined

export function db(): Promise<IDBPDatabase<BlueprintDb>> {
  database ??= openDB<BlueprintDb>(DB_NAME, DB_VERSION, {
    upgrade(instance) {
      if (!instance.objectStoreNames.contains('summaries')) instance.createObjectStore('summaries')
      if (!instance.objectStoreNames.contains('files')) instance.createObjectStore('files')
      if (!instance.objectStoreNames.contains('handles')) instance.createObjectStore('handles')
    },
  })
  return database
}

/**
 * Test seam: closes and forgets the connection so a test can delete the database. An open
 * connection makes `deleteDatabase` block instead of completing.
 */
export async function resetDbForTests(): Promise<void> {
  const open = database
  database = undefined
  if (open) (await open).close()
}

export class IndexedDbStore implements ProjectStore {
  readonly kind = 'indexeddb' as const

  get available(): boolean {
    return typeof indexedDB !== 'undefined'
  }

  async list(): Promise<ProjectSummary[]> {
    const summaries = await (await db()).getAll('summaries')
    // Most recently saved first: the dashboard shows recent work, not alphabetical order.
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async open(id: string): Promise<ProjectFiles | undefined> {
    return (await db()).get('files', id)
  }

  async save(id: string, files: ProjectFiles, meta: SaveMeta): Promise<ProjectSummary> {
    const summary: ProjectSummary = { id, kind: this.kind, updatedAt: Date.now(), ...meta }
    const instance = await db()
    const transaction = instance.transaction(['summaries', 'files'], 'readwrite')
    await Promise.all([
      transaction.objectStore('summaries').put(summary, id),
      transaction.objectStore('files').put(files, id),
      transaction.done,
    ])
    return summary
  }

  async delete(id: string): Promise<void> {
    const instance = await db()
    const transaction = instance.transaction(['summaries', 'files'], 'readwrite')
    await Promise.all([
      transaction.objectStore('summaries').delete(id),
      transaction.objectStore('files').delete(id),
      transaction.done,
    ])
  }

  async importFiles(files: ProjectFiles, meta: SaveMeta): Promise<ProjectSummary> {
    return this.save(newProjectId(meta.blueprintId), files, meta)
  }

  async requireOpen(id: string): Promise<ProjectFiles> {
    const files = await this.open(id)
    if (!files) throw new StorageError(`No project stored under "${id}".`, 'not-found')
    return files
  }
}

export const indexedDbStore = new IndexedDbStore()
