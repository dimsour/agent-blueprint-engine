/**
 * The bridge between a store (which moves files) and the domain (which understands them).
 *
 * Every path in and out of storage goes through `readProject` and `renderProjectFiles`, so
 * a project saved by the app is byte-identical to one written by the future CLI, and a
 * project edited by hand in an editor loads with the same diagnostics the app would show.
 */
import {
  type Blueprint,
  countEntities,
  type Diagnostic,
  MemoryFs,
  type Migration,
  ProjectReadError,
  readProject,
  renderProjectFiles,
} from '@agent-blueprint/core'

import { fileSystemStore } from './file-system'
import { indexedDbStore } from './indexeddb'
import {
  FILE_SYSTEM_ID_PREFIX,
  type ProjectFiles,
  type ProjectStore,
  type ProjectSummary,
  type SaveMeta,
} from './types'
import { StorageError } from './types'

export interface LoadedProject {
  blueprint: Blueprint
  /** Problems found while reading; the UI shows these before the project opens. */
  diagnostics: Diagnostic[]
  /** The schema version the files were written at, before any migration. */
  sourceSchemaVersion: string
  /** The migrations that ran on the way in; empty when the project was already current. */
  migrations: Migration[]
}

/** Parses a file map into a Blueprint. Throws `StorageError` when it is not a project. */
export async function parseProject(files: ProjectFiles): Promise<LoadedProject> {
  try {
    const { blueprint, diagnostics, sourceSchemaVersion, migrations } = await readProject(
      new MemoryFs(files),
    )
    return { blueprint, diagnostics, sourceSchemaVersion, migrations }
  } catch (error) {
    if (error instanceof ProjectReadError) {
      throw new StorageError(
        error.code === 'MANIFEST_MISSING'
          ? 'That folder is not an Agent Blueprint project: it has no blueprint/blueprint.yaml.'
          : error.message,
        error.code === 'UNSUPPORTED_SCHEMA_VERSION' ? 'unsupported' : 'invalid',
      )
    }
    throw error
  }
}

export function projectFilesOf(blueprint: Blueprint): ProjectFiles {
  return renderProjectFiles(blueprint)
}

export function summaryOf(blueprint: Blueprint): SaveMeta {
  return {
    name: blueprint.name,
    ...(blueprint.description !== undefined ? { description: blueprint.description } : {}),
    blueprintId: blueprint.id,
    artifacts: countEntities(blueprint),
  }
}

/**
 * The store a project lives in, read off its id.
 *
 * A folder project is a folder: it is not copied anywhere, and a save has to go back to the
 * directory it was opened from. The id carries which store owns it, because everything that
 * has only the id — a route parameter, a recent-projects row, an autosave — needs to know.
 */
export function storeFor(id: string): ProjectStore {
  return id.startsWith(FILE_SYSTEM_ID_PREFIX) ? fileSystemStore : indexedDbStore
}

export async function openProject(
  id: string,
  store: ProjectStore = storeFor(id),
): Promise<LoadedProject> {
  const files = await store.open(id)
  if (!files) throw new StorageError(`No project stored under "${id}".`, 'not-found')
  return parseProject(files)
}

export async function saveProject(
  id: string,
  blueprint: Blueprint,
  store: ProjectStore = storeFor(id),
): Promise<ProjectSummary> {
  return store.save(id, projectFilesOf(blueprint), summaryOf(blueprint))
}

/** Creates a new stored project from a Blueprint (a template, or the wizard's draft). */
export async function createProject(
  blueprint: Blueprint,
  store: ProjectStore = indexedDbStore,
): Promise<ProjectSummary> {
  return store.importFiles(projectFilesOf(blueprint), summaryOf(blueprint))
}

/** Creates a stored project from an imported file map, validating it first. */
export async function importProject(
  files: ProjectFiles,
  store: ProjectStore = indexedDbStore,
): Promise<{ summary: ProjectSummary; loaded: LoadedProject }> {
  const loaded = await parseProject(files)
  const summary = await store.importFiles(files, summaryOf(loaded.blueprint))
  return { summary, loaded }
}
