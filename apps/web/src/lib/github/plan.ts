/**
 * What a push would do, before it does it.
 *
 * The rule this has to honour is the one the compiler already has (ADR-6): the build manifest
 * records the paths the compiler owns, and nothing outside that set is ever overwritten without
 * being asked. Rather than restate those rules against a repository, the plan runs the real
 * `writeCompiled` over a file system that records instead of writing, with the branch behind it.
 * The consequence is that pushing to GitHub and exporting to a folder cannot drift apart: they
 * are the same function, over two backends.
 *
 * A plan therefore comes out as four kinds of thing:
 *
 *   - **changes** — files to add, update or delete, all of them ours by the manifest's account;
 *   - **conflicts** — files the branch already has that this push would overwrite and does not
 *     own (a `CLAUDE.md` written by hand before the Blueprint existed). Listed, and skipped
 *     unless the user says otherwise, one by one;
 *   - **unchanged** — the count, which on a second push of an untouched project is everything;
 *   - **diagnostics** — the compiler's, because a Blueprint with errors compiles to files that
 *     misrepresent it, and pushing those is worse than refusing.
 */
import {
  type Blueprint,
  buildManifestPath,
  canonicalJson,
  DEFAULT_SOURCE_DIR,
  type Diagnostic,
  type VirtualFs,
} from '@agent-blueprint/core'
import {
  buildManifestFor,
  compileBlueprint,
  readBuildManifest,
  writeCompiled,
} from '@agent-blueprint/exporters'

import { projectFilesOf, type ProjectFiles } from '@/lib/storage'

export type ChangeKind = 'add' | 'update' | 'delete'

export interface FileChange {
  path: string
  kind: ChangeKind
  /** What to write. Absent for a delete. */
  content?: string
  /**
   * The branch's copy differs from what the manifest recorded, so someone edited it there
   * after the last push. Pushing replaces it, which the user should be told before it happens.
   */
  handEdited?: boolean
}

export interface PushPlan {
  changes: FileChange[]
  /** Existing files this push would overwrite without owning them. Excluded until accepted. */
  conflicts: FileChange[]
  unchanged: number
  /** The branch does not exist yet: this push writes the first commit on it. */
  newBranch: boolean
  /** GitHub stopped listing the tree, so a deletion may be missing from this plan. */
  truncated: boolean
  diagnostics: Diagnostic[]
  /** False when the Blueprint has an error. The UI refuses to push on it. */
  ok: boolean
}

export interface RemoteBranch {
  /** The branch, read-only. */
  fs: VirtualFs
  /** GitHub stopped listing the tree; the plan says so rather than assuming it saw everything. */
  truncated: boolean
  /**
   * Optional: settle which of these files the branch already has, byte for byte, before the
   * plan starts reading them. `GitHubTreeFs` uses it to avoid downloading what has not changed.
   */
  prime?: (files: ProjectFiles) => Promise<void>
}

/**
 * A file system that answers from the branch and remembers what was asked of it.
 *
 * This is the whole trick: `writeCompiled` believes it is writing, so every ownership rule it
 * enforces is enforced here too, and nothing leaves the browser.
 */
class RecordingFs implements VirtualFs {
  readonly writes = new Map<string, string>()
  readonly deletes = new Set<string>()

  constructor(private readonly base: VirtualFs | undefined) {}

  async read(path: string): Promise<string | undefined> {
    if (this.writes.has(path)) return this.writes.get(path)
    if (this.deletes.has(path)) return undefined
    return this.base?.read(path)
  }

  write(path: string, content: string): Promise<void> {
    this.deletes.delete(path)
    this.writes.set(path, content)
    return Promise.resolve()
  }

  delete(path: string): Promise<void> {
    this.writes.delete(path)
    this.deletes.add(path)
    return Promise.resolve()
  }

  async exists(path: string): Promise<boolean> {
    return (await this.read(path)) !== undefined
  }

  async list(prefix?: string): Promise<string[]> {
    const scope = prefix === undefined || prefix === '' ? '' : `${prefix.replace(/\/$/, '')}/`
    const paths = new Set([...((await this.base?.list(prefix)) ?? []), ...this.writes.keys()])
    return Array.from(paths)
      .filter((path) => path.startsWith(scope) && !this.deletes.has(path))
      .sort()
  }
}

export async function planPush(
  blueprint: Blueprint,
  remote: RemoteBranch | undefined,
): Promise<PushPlan> {
  const sourceDir = blueprint.settings.sourceDir || DEFAULT_SOURCE_DIR
  const compiled = compileBlueprint(blueprint)
  const manifest = await buildManifestFor(compiled)
  const source = projectFilesOf(blueprint)

  // Knowing what the branch already has, before anything is compared, is what keeps a push of
  // an unchanged project down to a single request.
  if (remote?.prime) {
    const everything: ProjectFiles = { ...source }
    for (const file of compiled.files) everything[file.path] = file.content
    everything[buildManifestPath(sourceDir)] = canonicalJson(manifest)
    await remote.prime(everything)
  }

  const previous = remote ? await readBuildManifest(remote.fs, sourceDir) : undefined
  const fs = new RecordingFs(remote?.fs)

  // The project source: everything under the source directory is the Blueprint's own, so it is
  // written whole, and anything the branch has there that the Blueprint no longer produces goes.
  for (const [path, content] of Object.entries(source)) await fs.write(path, content)
  const manifestPath = buildManifestPath(sourceDir)
  for (const path of (await remote?.fs.list(sourceDir)) ?? []) {
    if (path in source || path === manifestPath) continue
    await fs.delete(path)
  }

  // The compiled output: `writeCompiled` decides what it owns, what is stale and what it must
  // not touch. It also writes the manifest, which is why it runs last.
  const written = await writeCompiled(
    { ...compiled, buildManifest: manifest, sourceDir },
    fs,
    previous,
  )

  const handEdited = new Set(written.modifiedSinceBuild)
  const changes: FileChange[] = []
  let unchanged = written.unchanged.length

  for (const [path, content] of fs.writes) {
    const before = await remote?.fs.read(path)
    if (before === content) {
      unchanged += 1
      continue
    }
    changes.push({
      path,
      kind: before === undefined ? 'add' : 'update',
      content,
      ...(handEdited.has(path) ? { handEdited: true } : {}),
    })
  }

  for (const path of fs.deletes) {
    changes.push({ path, kind: 'delete' })
  }

  const conflicts: FileChange[] = written.skipped.map((path) => ({
    path,
    kind: 'update' as const,
    content: compiled.files.find((file) => file.path === path)?.content ?? '',
  }))

  return {
    changes: changes.sort(byPath),
    conflicts: conflicts.sort(byPath),
    unchanged,
    newBranch: remote === undefined,
    truncated: remote?.truncated ?? false,
    diagnostics: compiled.diagnostics,
    ok: compiled.ok,
  }
}

function byPath(a: FileChange, b: FileChange): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

/** The plan as the commit needs it: what to write, what to remove. Conflicts only if accepted. */
export function writesFor(
  plan: PushPlan,
  acceptedConflicts: readonly string[] = [],
): { writes: ProjectFiles; deletes: string[] } {
  const accepted = new Set(acceptedConflicts)
  const writes: ProjectFiles = {}
  const deletes: string[] = []

  for (const change of plan.changes) {
    if (change.kind === 'delete') deletes.push(change.path)
    else writes[change.path] = change.content ?? ''
  }
  for (const conflict of plan.conflicts) {
    if (accepted.has(conflict.path)) writes[conflict.path] = conflict.content ?? ''
  }

  return { writes, deletes: deletes.sort() }
}
