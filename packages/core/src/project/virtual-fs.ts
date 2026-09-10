/**
 * Minimal file-system abstraction. Everything in core does IO through it, so the same
 * reader/writer runs over an in-memory map (tests), a ZIP archive, IndexedDB, the browser
 * File System Access API, a GitHub tree, or Node's fs — each of those is a backend
 * implemented outside core.
 *
 * Paths are POSIX-style, relative, without a leading `./`. Most content is text (UTF-8);
 * `readBinary` and `writeBinary` exist for the files that are not, so a skill's assets survive
 * a read and a write unchanged instead of being decoded into something else.
 */
import { decodeUtf8, encodeUtf8 } from './binary'

/** A file's content: text, or raw bytes for anything that is not text. */
export type ProjectFile = string | Uint8Array

export interface VirtualFs {
  /** The file as text. Bytes that are not valid UTF-8 read as undefined, like a missing file. */
  read(path: string): Promise<string | undefined>
  readBinary(path: string): Promise<Uint8Array | undefined>
  write(path: string, content: string): Promise<void>
  writeBinary(path: string, content: Uint8Array): Promise<void>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** All file paths under `prefix` (or every file when omitted), sorted. */
  list(prefix?: string): Promise<string[]>
}

export function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') throw new Error(`Path escapes the project root: ${path}`)
    out.push(part)
  }
  return out.join('/')
}

export function joinPath(...segments: string[]): string {
  return normalizePath(segments.join('/'))
}

/** In-memory backend. */
export class MemoryFs implements VirtualFs {
  private readonly files = new Map<string, ProjectFile>()

  constructor(initial: Record<string, ProjectFile> = {}) {
    for (const [path, content] of Object.entries(initial))
      this.files.set(normalizePath(path), content)
  }

  read(path: string): Promise<string | undefined> {
    const content = this.files.get(normalizePath(path))
    if (content === undefined) return Promise.resolve(undefined)
    return Promise.resolve(typeof content === 'string' ? content : decodeUtf8(content))
  }

  readBinary(path: string): Promise<Uint8Array | undefined> {
    const content = this.files.get(normalizePath(path))
    if (content === undefined) return Promise.resolve(undefined)
    return Promise.resolve(typeof content === 'string' ? encodeUtf8(content) : content)
  }

  write(path: string, content: string): Promise<void> {
    this.files.set(normalizePath(path), content)
    return Promise.resolve()
  }

  writeBinary(path: string, content: Uint8Array): Promise<void> {
    this.files.set(normalizePath(path), content)
    return Promise.resolve()
  }

  delete(path: string): Promise<void> {
    this.files.delete(normalizePath(path))
    return Promise.resolve()
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(normalizePath(path)))
  }

  list(prefix?: string): Promise<string[]> {
    const normalizedPrefix = prefix === undefined ? '' : `${normalizePath(prefix)}/`
    const paths = Array.from(this.files.keys())
      .filter((path) => normalizedPrefix === '' || path.startsWith(normalizedPrefix))
      .sort()
    return Promise.resolve(paths)
  }
}
