/**
 * A branch, read as a file system.
 *
 * `VirtualFs` is what the whole project format is written against, so making a GitHub branch
 * into one means the reader, the compiler and the ownership rules that already exist work
 * against a repository without knowing it is one (ADR-14). Nothing here writes: a push is a
 * commit built from a plan, not a sequence of file operations.
 *
 * The expensive part is content, and most of it never has to be fetched. Git names a blob by
 * the SHA-1 of its bytes, and that is computable here — so for every file this app is about to
 * write, comparing our own hash against the tree's entry answers "is this already what is
 * there?" for free. Identical means the remote content is our content, and it goes into the
 * cache without a request. Only the files that actually differ are downloaded, and those in
 * parallel. On a second push of an unchanged project that is one request in total.
 */
import type { VirtualFs } from '@agent-blueprint/core'

import { githubRequest } from './client'
import { getBranch, type RepoRef } from './repos'

export interface TreeEntry {
  path: string
  /** The blob's Git object id: SHA-1 over `blob <length>\0<bytes>`. */
  sha: string
  size: number
}

export interface RemoteTree {
  /** The commit the branch points at. The parent of whatever this push commits. */
  commitSha: string
  treeSha: string
  entries: Map<string, TreeEntry>
  /**
   * GitHub stopped listing. It happens on repositories with more than 100 000 entries, and it
   * matters: a file this app would delete might simply not have been listed. The plan carries
   * this through to the UI rather than quietly pushing an incomplete comparison.
   */
  truncated: boolean
}

interface TreePayload {
  sha: string
  truncated?: boolean
  tree: { path: string; type: string; sha: string; size?: number }[]
}

/** The branch as it is now, or nothing when the branch does not exist yet. */
export async function readRemoteTree(
  token: string,
  repo: RepoRef,
  branch: string,
): Promise<RemoteTree | undefined> {
  const head = await getBranch(token, repo, branch)
  if (!head) return undefined

  const { data } = await githubRequest<TreePayload>(token, {
    path: `/repos/${repo.owner}/${repo.name}/git/trees/${head.sha}`,
    query: { recursive: '1' },
  })

  const entries = new Map<string, TreeEntry>()
  for (const entry of data.tree) {
    if (entry.type !== 'blob') continue
    entries.set(entry.path, { path: entry.path, sha: entry.sha, size: entry.size ?? 0 })
  }

  return {
    commitSha: head.sha,
    treeSha: data.sha,
    entries,
    truncated: data.truncated === true,
  }
}

/** How many blobs to fetch at once: enough to hide the latency, few enough to be polite. */
const FETCH_CONCURRENCY = 8

export class GitHubTreeFs implements VirtualFs {
  private readonly contents = new Map<string, string>()

  constructor(
    private readonly token: string,
    private readonly repo: RepoRef,
    private readonly tree: RemoteTree | undefined,
  ) {}

  /** Every path on the branch, or an empty list when the branch does not exist. */
  paths(): string[] {
    return this.tree ? Array.from(this.tree.entries.keys()).sort() : []
  }

  get truncated(): boolean {
    return this.tree?.truncated ?? false
  }

  /**
   * Settles, for a set of files this app is about to write, which of them the branch already
   * has byte for byte — without downloading those — and downloads the rest in parallel.
   */
  async prime(files: Record<string, string>): Promise<void> {
    if (!this.tree) return
    const differing: string[] = []

    for (const [path, content] of Object.entries(files)) {
      const entry = this.tree.entries.get(path)
      if (!entry || this.contents.has(path)) continue
      if (entry.sha === (await gitBlobSha(content))) this.contents.set(path, content)
      else differing.push(path)
    }

    for (let index = 0; index < differing.length; index += FETCH_CONCURRENCY) {
      await Promise.all(
        differing
          .slice(index, index + FETCH_CONCURRENCY)
          .map((path) => this.fetchBlob(path).catch(() => undefined)),
      )
    }
  }

  async read(path: string): Promise<string | undefined> {
    const cached = this.contents.get(path)
    if (cached !== undefined) return cached
    if (!this.tree?.entries.has(path)) return undefined
    return this.fetchBlob(path)
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.tree?.entries.has(path) ?? false)
  }

  list(prefix?: string): Promise<string[]> {
    const scope = prefix === undefined || prefix === '' ? '' : `${prefix.replace(/\/$/, '')}/`
    return Promise.resolve(this.paths().filter((path) => path.startsWith(scope)))
  }

  write(): Promise<void> {
    return Promise.reject(new Error('A GitHub branch is read here; a push is a commit.'))
  }

  delete(): Promise<void> {
    return Promise.reject(new Error('A GitHub branch is read here; a push is a commit.'))
  }

  private async fetchBlob(path: string): Promise<string | undefined> {
    const entry = this.tree?.entries.get(path)
    if (!entry) return undefined

    const { data } = await githubRequest<{ content: string; encoding: string }>(this.token, {
      path: `/repos/${this.repo.owner}/${this.repo.name}/git/blobs/${entry.sha}`,
    })
    const text = data.encoding === 'base64' ? decodeBase64(data.content) : data.content
    this.contents.set(path, text)
    return text
  }
}

/**
 * The object id Git would give this content.
 *
 * `blob <byte length>\0` then the bytes, hashed with SHA-1 — Git's own recipe, which is what
 * makes a local string comparable to a tree entry without downloading anything. SHA-1 is
 * Git's choice of identifier here, not a security decision of ours.
 */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content)
  const header = new TextEncoder().encode(`blob ${body.length}\0`)
  const bytes = new Uint8Array(header.length + body.length)
  bytes.set(header)
  bytes.set(body, header.length)

  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
