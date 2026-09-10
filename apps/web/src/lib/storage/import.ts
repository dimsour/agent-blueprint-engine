/**
 * Reading a project someone hands you.
 *
 * A file arrives from a picker or a drop and could be an archive, a manifest, or something
 * that is not a project at all. This turns any of them into a file map and then into a
 * preview, so the app can say what it found and what is wrong with it before anything is
 * stored. Import never trusts the file: the diagnostics come from the same reader the
 * workspace uses.
 */
import {
  type Blueprint,
  buildManifestPath,
  DEFAULT_SOURCE_DIR,
  type Diagnostic,
  type Migration,
  sameFile,
} from '@agent-blueprint/core'

import { MANIFEST_PATH } from './paths'
import { parseProject, projectFilesOf } from './project'
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

export type RewriteKind = 'add' | 'update' | 'remove'

/** A source file that saving would not leave as it arrived. */
export interface Rewrite {
  path: string
  kind: RewriteKind
}

export interface ImportPreview {
  /** Where it came from: an archive name, a folder name, a manifest file name. */
  label: string
  files: ProjectFiles
  blueprint: Blueprint
  diagnostics: Diagnostic[]
  errors: Diagnostic[]
  warnings: Diagnostic[]
  /** The schema version the files were written at. */
  sourceSchemaVersion: string
  /** Migrations that ran on the way in. Empty when the project was already current. */
  migrations: Migration[]
  /** What saving would change under the source directory. Empty when it round-trips. */
  rewrites: Rewrite[]
  /**
   * The project this already is, when it came from somewhere that keeps it: a folder on disk
   * stays that folder. Absent for an archive or a manifest, which have to be stored somewhere
   * before they are a project.
   */
  existingId?: string
}

/**
 * Parses without storing anything. Throws `StorageError` only when the files are not a
 * project at all; everything else comes back as diagnostics for the user to weigh.
 */
export async function previewImport(
  files: ProjectFiles,
  label: string,
  existingId?: string,
): Promise<ImportPreview> {
  const { blueprint, diagnostics, sourceSchemaVersion, migrations } = await parseProject(files)
  return {
    label,
    ...(existingId ? { existingId } : {}),
    files,
    blueprint,
    diagnostics,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
    sourceSchemaVersion,
    migrations,
    rewrites: rewritesOf(files, blueprint),
  }
}

/**
 * What saving would change about the files that arrived.
 *
 * A project the app writes round-trips exactly, so an empty list is the normal answer and a
 * non-empty one is worth reading: a migration ran, or the file was hand-edited into a shape
 * the writer states differently — a default written out in full, keys in another order, a
 * missing trailing newline. Saying so before anything is stored is the point; a diff that
 * appears in `git status` after the fact is the same information, too late.
 *
 * Only the source directory is compared. Everything else in the archive is compiled output,
 * which the compiler owns and rewrites on its own terms, and the build manifest describes the
 * repository it came from rather than this copy.
 */
function rewritesOf(files: ProjectFiles, blueprint: Blueprint): Rewrite[] {
  const sourceDir = blueprint.settings.sourceDir || DEFAULT_SOURCE_DIR
  const produced = projectFilesOf(blueprint)
  const manifest = buildManifestPath(sourceDir)
  const incoming = Object.keys(files).filter(
    (path) => path.startsWith(`${sourceDir}/`) && path !== manifest,
  )

  const rewrites: Rewrite[] = []
  for (const path of Object.keys(produced)) {
    if (!(path in files)) rewrites.push({ path, kind: 'add' })
    else if (!sameFile(files[path], produced[path])) rewrites.push({ path, kind: 'update' })
  }
  for (const path of incoming) {
    if (!(path in produced)) rewrites.push({ path, kind: 'remove' })
  }
  return rewrites.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
