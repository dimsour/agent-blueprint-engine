/**
 * Projects in a real folder on disk, through the File System Access API.
 *
 * This is the store that makes the product genuinely local-first: the user's project is a
 * directory they can open in an editor and commit to git, and saving writes straight to it.
 * Only Chromium browsers implement the API, so the store reports itself unavailable
 * elsewhere and the dashboard hides the option rather than failing at click time.
 *
 * Handles are kept in IndexedDB so a folder opened yesterday is still listed today. The
 * browser still asks for permission again on a new session; `open` requests it.
 */
import { DEFAULT_SOURCE_DIR, decodeUtf8, parseEntityPath } from '@agent-blueprint/core'

import { db } from './indexeddb'
import {
  FILE_SYSTEM_ID_PREFIX,
  newProjectId,
  type ProjectFiles,
  type ProjectStore,
  type ProjectSummary,
  type SaveMeta,
  StorageError,
} from './types'

/** The parts of the File System Access API this store uses. */
interface DirectoryHandle {
  readonly name: string
  isSameEntry?(other: DirectoryHandle): Promise<boolean>
  keys(): AsyncIterableIterator<string>
  entries(): AsyncIterableIterator<[string, FileSystemHandleLike]>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface FileHandle {
  readonly name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: string | Uint8Array): Promise<void>
    close(): Promise<void>
  }>
}

type FileSystemHandleLike = (DirectoryHandle | FileHandle) & { kind: 'file' | 'directory' }

interface StoredHandle {
  id: string
  name: string
  handle: unknown
}

export function fileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export class FileSystemAccessStore implements ProjectStore {
  readonly kind = 'file-system' as const

  get available(): boolean {
    return fileSystemAccessSupported()
  }

  async list(): Promise<ProjectSummary[]> {
    if (!this.available) return []
    const stored = await (await db()).getAll('handles')
    return stored.map((entry) => ({
      id: entry.id,
      name: entry.name,
      blueprintId: entry.id,
      artifacts: 0,
      updatedAt: 0,
      kind: this.kind,
    }))
  }

  /** Prompts for a folder and remembers it. Returns the files it contains. */
  async pickDirectory(): Promise<{ id: string; name: string; files: ProjectFiles }> {
    if (!this.available) {
      throw new StorageError('This browser cannot open a folder directly.', 'unavailable')
    }
    const picker = (
      window as unknown as {
        showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<DirectoryHandle>
      }
    ).showDirectoryPicker
    const handle = await picker({ mode: 'readwrite' })

    // The directory's name is not an identity: two projects are often both called `blueprint`,
    // and one would open the other. The handle is the identity, so an id is minted once per
    // folder and reused when that same folder is picked again.
    const existing = await this.idOfSameFolder(handle)
    const id = existing ?? `${FILE_SYSTEM_ID_PREFIX}${newProjectId(slug(handle.name))}`

    await (await db()).put('handles', { id, name: handle.name, handle }, id)
    return { id, name: handle.name, files: await readDirectory(handle) }
  }

  /** The id already minted for this folder, if it has been opened before. */
  private async idOfSameFolder(handle: DirectoryHandle): Promise<string | undefined> {
    if (!handle.isSameEntry) return undefined
    const stored = (await (await db()).getAll('handles')) as StoredHandle[]
    for (const entry of stored) {
      const other = entry.handle as DirectoryHandle | undefined
      // A handle from a previous session may no longer be comparable; that is not an error,
      // it just means this pick mints a new id.
      const same = await handle.isSameEntry(other as DirectoryHandle).catch(() => false)
      if (same) return entry.id
    }
    return undefined
  }

  async open(id: string): Promise<ProjectFiles | undefined> {
    const handle = await this.handleFor(id)
    if (!handle) return undefined
    await ensurePermission(handle, 'read')
    return readDirectory(handle)
  }

  async save(id: string, files: ProjectFiles, meta: SaveMeta): Promise<ProjectSummary> {
    const handle = await this.handleFor(id)
    if (!handle) throw new StorageError(`No folder is linked to "${id}".`, 'not-found')
    await ensurePermission(handle, 'readwrite')
    await writeDirectory(handle, files)
    return { id, kind: this.kind, updatedAt: Date.now(), ...meta }
  }

  async delete(id: string): Promise<void> {
    // Forgets the folder; it never deletes the user's files.
    await (await db()).delete('handles', id)
  }

  async importFiles(): Promise<ProjectSummary> {
    throw new StorageError(
      'Importing into a folder is not supported; open the folder instead.',
      'unavailable',
    )
  }

  private async handleFor(id: string): Promise<DirectoryHandle | undefined> {
    const stored = (await (await db()).get('handles', id)) as StoredHandle | undefined
    return stored?.handle as DirectoryHandle | undefined
  }
}

async function ensurePermission(
  handle: DirectoryHandle,
  mode: 'read' | 'readwrite',
): Promise<void> {
  const current = (await handle.queryPermission?.({ mode })) ?? 'granted'
  if (current === 'granted') return
  const requested = (await handle.requestPermission?.({ mode })) ?? 'denied'
  if (requested !== 'granted') {
    throw new StorageError('Permission to use that folder was declined.', 'permission-denied')
  }
}

/** Directories the compiler and the editor never need to read. */
const SKIPPED = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.turbo'])

/** Exposed for tests: a real directory handle needs a browser, the reading logic does not. */
export const readDirectoryForTests = (handle: DirectoryHandle): Promise<ProjectFiles> =>
  readDirectory(handle)

/** Exposed for tests, for the same reason: writing and pruning is where the rules live. */
export const writeDirectoryForTests = (
  handle: DirectoryHandle,
  files: ProjectFiles,
): Promise<void> => writeDirectory(handle, files)

async function readDirectory(handle: DirectoryHandle, prefix = ''): Promise<ProjectFiles> {
  const files: ProjectFiles = {}
  for await (const [name, child] of handle.entries()) {
    if (SKIPPED.has(name)) continue
    const path = prefix ? `${prefix}/${name}` : name
    if (child.kind === 'directory') {
      Object.assign(files, await readDirectory(child as DirectoryHandle, path))
    } else {
      // Read the bytes and decode only what is text. `file.text()` on a skill's asset returns
      // a string that is no longer the file, and saving would then write that back over it.
      const file = await (child as FileHandle).getFile()
      const bytes = new Uint8Array(await file.arrayBuffer())
      files[path] = decodeUtf8(bytes) ?? bytes
    }
  }
  return files
}

/** A folder-safe id fragment from a directory name. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'folder'
  )
}

/** Where the project lives inside the folder, read off the manifest the writer produced. */
function sourceDirOf(files: ProjectFiles): string {
  const manifest = Object.keys(files).find((path) => path.endsWith('/blueprint.yaml'))
  return manifest ? manifest.slice(0, manifest.lastIndexOf('/')) : DEFAULT_SOURCE_DIR
}

/**
 * Removes artifact files the project no longer produces.
 *
 * Without this, deleting an artifact deletes it from the Blueprint and leaves its file on
 * disk, so the next open reads it back and the artifact returns from the dead. The rule for
 * what may be removed is core's: a path under the source directory that parses as an artifact
 * file. Everything else in the folder is the user's — the build manifest, the compiled output,
 * a README, .git — and none of it is this function's to delete.
 */
async function pruneDirectory(
  handle: DirectoryHandle,
  files: ProjectFiles,
  prefix = '',
): Promise<void> {
  const sourceDir = sourceDirOf(files)
  for await (const [name, child] of handle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    // Only descend towards the source directory, and only inspect what is inside it.
    const inside = path.startsWith(`${sourceDir}/`)
    const onTheWay = `${sourceDir}/`.startsWith(`${path}/`)
    if (!inside && !onTheWay) continue
    if (child.kind === 'directory') {
      await pruneDirectory(child as DirectoryHandle, files, path)
      continue
    }
    if (path in files) continue
    if (!parseEntityPath(sourceDir, path)) continue
    await handle.removeEntry(name)
  }
}

async function writeDirectory(handle: DirectoryHandle, files: ProjectFiles): Promise<void> {
  for (const path of Object.keys(files).sort()) {
    const segments = path.split('/')
    const filename = segments.pop()
    if (!filename) continue

    let directory = handle
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment, { create: true })
    }
    const fileHandle = await directory.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    // A Uint8Array is written as its bytes; only a string is encoded as UTF-8.
    const content = files[path]
    await writable.write(content === undefined ? '' : content)
    await writable.close()
  }

  await pruneDirectory(handle, files)
}

export const fileSystemStore = new FileSystemAccessStore()
