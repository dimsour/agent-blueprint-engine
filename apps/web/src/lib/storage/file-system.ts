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
import { db } from './indexeddb'
import {
  type ProjectFiles,
  type ProjectStore,
  type ProjectSummary,
  type SaveMeta,
  StorageError,
} from './types'

/** The parts of the File System Access API this store uses. */
interface DirectoryHandle {
  readonly name: string
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
    const id = `fs:${handle.name}`

    await (await db()).put('handles', { id, name: handle.name, handle }, id)
    return { id, name: handle.name, files: await readDirectory(handle) }
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

async function readDirectory(handle: DirectoryHandle, prefix = ''): Promise<ProjectFiles> {
  const files: ProjectFiles = {}
  for await (const [name, child] of handle.entries()) {
    if (SKIPPED.has(name)) continue
    const path = prefix ? `${prefix}/${name}` : name
    if (child.kind === 'directory') {
      Object.assign(files, await readDirectory(child as DirectoryHandle, path))
    } else {
      const file = await (child as FileHandle).getFile()
      files[path] = await file.text()
    }
  }
  return files
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
}

export const fileSystemStore = new FileSystemAccessStore()
