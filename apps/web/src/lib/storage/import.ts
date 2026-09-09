/**
 * Reading a project someone hands you.
 *
 * A file arrives from a picker or a drop and could be an archive, a manifest, or something
 * that is not a project at all. This turns any of them into a file map and then into a
 * preview, so the app can say what it found and what is wrong with it before anything is
 * stored. Import never trusts the file: the diagnostics come from the same reader the
 * workspace uses.
 */
import type { Blueprint, Diagnostic } from '@agent-blueprint/core'

import { parseProject } from './project'
import type { ProjectFiles } from './types'
import { StorageError } from './types'
import { zipToFiles } from './zip'

/** Extensions the import picker accepts. */
export const IMPORT_ACCEPT = '.zip,.yaml,.yml,.json,application/zip'

/** A lone manifest is a project with no artifact files; its diagnostics say the rest. */
const MANIFEST_PATH = 'blueprint/blueprint.yaml'

function isManifestName(name: string): boolean {
  return /\.(ya?ml|json)$/i.test(name)
}

/** Turns an uploaded file into the file map `parseProject` consumes. */
export async function readUpload(file: File): Promise<ProjectFiles> {
  if (isManifestName(file.name)) {
    const text = await file.text()
    if (text.trim() === '') throw new StorageError('That file is empty.', 'invalid')
    return { [MANIFEST_PATH]: text }
  }
  return zipToFiles(await file.arrayBuffer())
}

export interface ImportPreview {
  /** Where it came from: an archive name, a folder name, a manifest file name. */
  label: string
  files: ProjectFiles
  blueprint: Blueprint
  diagnostics: Diagnostic[]
  errors: Diagnostic[]
  warnings: Diagnostic[]
}

/**
 * Parses without storing anything. Throws `StorageError` only when the files are not a
 * project at all; everything else comes back as diagnostics for the user to weigh.
 */
export async function previewImport(files: ProjectFiles, label: string): Promise<ImportPreview> {
  const { blueprint, diagnostics } = await parseProject(files)
  return {
    label,
    files,
    blueprint,
    diagnostics,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
  }
}
