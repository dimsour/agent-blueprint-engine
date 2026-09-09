/**
 * ZIP import and export.
 *
 * ZIP is a transport, not a store: it has no list and no identity, so it is a pair of
 * functions rather than a `ProjectStore`. Directory entries and anything outside the
 * archive root are dropped, and a single top-level folder (what most tools produce when you
 * zip a directory) is unwrapped so an export/import round trip is the identity.
 *
 * Archives are byte-identical for identical input. JSZip stamps the wall clock into every
 * entry unless it is given a date, which would both break the determinism rule and put the
 * author's clock inside a file they share.
 */
import JSZip from 'jszip'

import { MANIFEST_PATH } from './paths'
import type { ProjectFiles } from './types'
import { StorageError } from './types'

/** The epoch, so two exports of the same Blueprint are the same bytes. */
const FIXED_ENTRY_DATE = new Date(0)

export async function filesToZip(files: ProjectFiles): Promise<Blob> {
  const zip = new JSZip()
  // Sorted so the archive bytes depend only on the content, not on object key order.
  for (const path of Object.keys(files).sort()) {
    // `createFolders` is off because the implicit directory entries JSZip would add carry
    // the wall clock no matter what date the file is given, and every unzipper creates the
    // parent directories from the file paths anyway.
    zip.file(path, files[path] ?? '', { date: FIXED_ENTRY_DATE, createFolders: false })
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Files an archiver adds that are not part of the project. */
function isArchiverNoise(path: string): boolean {
  return (
    path.startsWith('__MACOSX/') ||
    path.split('/').some((segment) => segment === '.DS_Store' || segment === 'Thumbs.db')
  )
}

export async function zipToFiles(data: Blob | ArrayBuffer | Uint8Array): Promise<ProjectFiles> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(data)
  } catch (error) {
    throw new StorageError(
      `That file is not a readable ZIP archive: ${error instanceof Error ? error.message : String(error)}`,
      'invalid',
    )
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length === 0) throw new StorageError('The archive is empty.', 'invalid')

  const files: ProjectFiles = {}
  for (const entry of entries) {
    const path = normalize(entry.name)
    // macOS resource forks are real entries, not directories, so they survive the filter
    // above and would otherwise make every archive look like it has two roots.
    if (isArchiverNoise(path)) continue
    files[path] = await entry.async('string')
  }

  if (Object.keys(files).length === 0) throw new StorageError('The archive is empty.', 'invalid')
  return unwrapSingleRoot(files)
}

function normalize(path: string): string {
  return (
    path
      .replace(/\\/g, '/')
      .split('/')
      // A "." or ".." segment is either an artefact of the archiver or an attempt to write
      // outside the project; neither belongs in a path the app will later hand to a store.
      .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
      .join('/')
  )
}

/**
 * `my-agent/blueprint/blueprint.yaml` becomes `blueprint/blueprint.yaml`. Only strips a
 * prefix that every entry shares, so a project whose files legitimately sit at the root is
 * left alone.
 */
function unwrapSingleRoot(files: ProjectFiles): ProjectFiles {
  // Already at the project root: unwrapping would destroy the structure. Testing for the
  // manifest rather than for a folder called "blueprint" is what makes a repository that
  // happens to be named "blueprint", or a re-zipped export, import correctly.
  if (MANIFEST_PATH in files) return files

  const paths = Object.keys(files)
  const firstSegments = new Set(paths.map((path) => path.split('/')[0]))
  if (firstSegments.size !== 1) return files

  const [root] = [...firstSegments]
  if (root === undefined || paths.some((path) => !path.includes('/'))) return files

  return Object.fromEntries(paths.map((path) => [path.slice(root.length + 1), files[path] ?? '']))
}

/** Hands a blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoking in the same task cancels the download in some browsers; let it start first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Triggers a browser download of an archive, named so it ends in .zip. */
export function downloadZip(blob: Blob, filename: string): void {
  downloadBlob(blob, filename.endsWith('.zip') ? filename : `${filename}.zip`)
}
