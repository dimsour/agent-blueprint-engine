/**
 * ZIP import and export.
 *
 * ZIP is a transport, not a store: it has no list and no identity, so it is a pair of
 * functions rather than a `ProjectStore`. Directory entries and anything outside the
 * archive root are dropped, and a single top-level folder (what most tools produce when you
 * zip a directory) is unwrapped so an export/import round trip is the identity.
 */
import JSZip from 'jszip'

import type { ProjectFiles } from './types'
import { StorageError } from './types'

export async function filesToZip(files: ProjectFiles): Promise<Blob> {
  const zip = new JSZip()
  // Sorted so the archive bytes depend only on the content, not on object key order.
  for (const path of Object.keys(files).sort()) {
    zip.file(path, files[path] ?? '')
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
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
    files[normalize(entry.name)] = await entry.async('string')
  }

  return unwrapSingleRoot(files)
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * `my-agent/blueprint/blueprint.yaml` becomes `blueprint/blueprint.yaml`. Only strips a
 * prefix that every entry shares, so a project whose files legitimately sit at the root is
 * left alone.
 */
function unwrapSingleRoot(files: ProjectFiles): ProjectFiles {
  const paths = Object.keys(files)
  const firstSegments = new Set(paths.map((path) => path.split('/')[0]))
  if (firstSegments.size !== 1) return files

  const [root] = [...firstSegments]
  if (root === undefined || paths.some((path) => !path.includes('/'))) return files
  // Never unwrap the source directory itself: that would lose the project structure.
  if (root === 'blueprint') return files

  return Object.fromEntries(paths.map((path) => [path.slice(root.length + 1), files[path] ?? '']))
}

/** Triggers a browser download of the archive. */
export function downloadZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.zip') ? filename : `${filename}.zip`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
