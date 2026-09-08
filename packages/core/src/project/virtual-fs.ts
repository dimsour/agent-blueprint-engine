/**
 * Minimal file-system abstraction. Everything in core does IO through it, so the same
 * reader/writer runs over an in-memory map (tests), a ZIP archive, IndexedDB, the browser
 * File System Access API, a GitHub tree, or Node's fs — each of those is a backend
 * implemented outside core.
 *
 * Paths are POSIX-style, relative, without a leading `./`. Content is text (UTF-8).
 */
export interface VirtualFs {
  read(path: string): Promise<string | undefined>
  write(path: string, content: string): Promise<void>
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
  private readonly files = new Map<string, string>()

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial))
      this.files.set(normalizePath(path), content)
  }

  read(path: string): Promise<string | undefined> {
    return Promise.resolve(this.files.get(normalizePath(path)))
  }

  write(path: string, content: string): Promise<void> {
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

  /** Snapshot as a plain object, sorted by path. */
  toRecord(): Record<string, string> {
    return Object.fromEntries(Array.from(this.files.entries()).sort(([a], [b]) => (a < b ? -1 : 1)))
  }
}
