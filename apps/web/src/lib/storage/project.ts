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
  ProjectReadError,
  readProject,
  renderProjectFiles,
} from '@agent-blueprint/core'

import { indexedDbStore } from './indexeddb'
import type { ProjectFiles, ProjectStore, ProjectSummary, SaveMeta } from './types'
import { StorageError } from './types'

export interface LoadedProject {
  blueprint: Blueprint
  /** Problems found while reading; the UI shows these before the project opens. */
  diagnostics: Diagnostic[]
}

/** Parses a file map into a Blueprint. Throws `StorageError` when it is not a project. */
export async function parseProject(files: ProjectFiles): Promise<LoadedProject> {
  try {
    const { blueprint, diagnostics } = await readProject(new MemoryFs(files))
    return { blueprint, diagnostics }
  } catch (error) {
    if (error instanceof ProjectReadError) {
      throw new StorageError(
        error.code === 'MANIFEST_MISSING'
          ? 'That folder is not an Agent Blueprint project: it has no blueprint/blueprint.yaml.'
          : error.message,
        'invalid',
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

export async function openProject(
  id: string,
  store: ProjectStore = indexedDbStore,
): Promise<LoadedProject> {
  const files = await store.open(id)
  if (!files) throw new StorageError(`No project stored under "${id}".`, 'not-found')
  return parseProject(files)
}

export async function saveProject(
  id: string,
  blueprint: Blueprint,
  store: ProjectStore = indexedDbStore,
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
