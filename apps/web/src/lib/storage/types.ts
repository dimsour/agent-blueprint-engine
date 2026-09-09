/**
 * Local-first project storage.
 *
 * A project is a `Record<path, content>` in exactly the shape `readProject` consumes and
 * `renderProjectFiles` produces, so a store never has to understand the Blueprint model: it
 * moves files. That is what lets the same code path serve IndexedDB, a real folder on disk
 * and a ZIP archive.
 */
export type ProjectFiles = Record<string, string>

export type ProjectStoreKind = 'indexeddb' | 'file-system'

export interface ProjectSummary {
  /** Storage id. Stable for the life of the project; not the Blueprint id. */
  id: string
  name: string
  description?: string
  blueprintId: string
  artifacts: number
  /**
   * Epoch milliseconds of the last save. Storage metadata only: it never enters the
   * Blueprint or a generated file, both of which must stay free of timestamps.
   */
  updatedAt: number
  kind: ProjectStoreKind
}

export interface SaveMeta {
  name: string
  description?: string
  blueprintId: string
  artifacts: number
}

export interface ProjectStore {
  readonly kind: ProjectStoreKind
  /** False when the browser cannot support this store; the UI hides it. */
  readonly available: boolean
  list(): Promise<ProjectSummary[]>
  open(id: string): Promise<ProjectFiles | undefined>
  save(id: string, files: ProjectFiles, meta: SaveMeta): Promise<ProjectSummary>
  delete(id: string): Promise<void>
  /** Creates a project from a file map (ZIP import, folder import, template). */
  importFiles(files: ProjectFiles, meta: SaveMeta): Promise<ProjectSummary>
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'unavailable' | 'permission-denied' | 'invalid',
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

/** A URL-safe id derived from a name, with a short random suffix to avoid collisions. */
export function newProjectId(blueprintId: string): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${blueprintId}-${suffix}`
}
