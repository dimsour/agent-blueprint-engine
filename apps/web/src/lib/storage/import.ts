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

import { MANIFEST_PATH } from './paths'
import { parseProject } from './project'
import type { ProjectFiles } from './types'
import { StorageError } from './types'
import { zipToFiles } from './zip'

/** Extensions the import picker accepts. */
export const IMPORT_ACCEPT = '.zip,.yaml,.yml,.json,application/zip'

/** Every ZIP archive begins with these four bytes. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte)
}

/**
 * Turns an uploaded file into the file map `parseProject` consumes.
 *
 * The choice is made on the bytes rather than the file name, because a file dragged out of a
 * chat or renamed by a colleague often carries the wrong extension, and "that file is not a
 * readable ZIP archive" is a poor way to describe a manifest. A lone manifest becomes a
 * project with no artifact files, which reads as diagnostics rather than as a failure.
 */
export async function readUpload(file: File): Promise<ProjectFiles> {
  const buffer = await file.arrayBuffer()
  if (looksLikeZip(new Uint8Array(buffer.slice(0, ZIP_MAGIC.length)))) return zipToFiles(buffer)

  const text = new TextDecoder().decode(buffer)
  if (text.trim() === '') throw new StorageError('That file is empty.', 'invalid')
  if (text.includes(String.fromCharCode(0))) {
    throw new StorageError(`${file.name} is neither a ZIP archive nor a text manifest.`, 'invalid')
  }
  return { [MANIFEST_PATH]: text }
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
