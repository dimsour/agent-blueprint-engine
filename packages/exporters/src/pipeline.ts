/**
 * The compile pipeline: Blueprint in, files out.
 *
 * ```
 * read → migrate → normalize → validate → per target compile → merge → manifest → write
 * ```
 *
 * Compilation itself is synchronous and pure, so the UI can preview output on every
 * keystroke; only hashing (Web Crypto) and file access are asynchronous.
 */
import {
  type Blueprint,
  type BuildManifest,
  type BuildManifestTarget,
  buildManifestPath,
  canonicalJson,
  DEFAULT_SOURCE_DIR,
  type Diagnostic,
  type EntityRef,
  type HarnessId,
  type ProjectFile,
  readProject,
  refKey,
  sameFile,
  sha256Hex,
  sortDiagnostics,
  validateBlueprint,
  type VirtualFs,
} from '@agent-blueprint/core'

import { adapterFor } from './registry'
import { emitReadme } from './shared/readme'
import type { CompatibilityIssue, GeneratedFile } from './types'

/** Reads whichever way the file was written, so a comparison is between like and like. */
async function readFile(fs: VirtualFs, path: string): Promise<ProjectFile | undefined> {
  const text = await fs.read(path)
  return text ?? (await fs.readBinary(path))
}

function writeFile(fs: VirtualFs, path: string, content: ProjectFile): Promise<void> {
  return typeof content === 'string' ? fs.write(path, content) : fs.writeBinary(path, content)
}

/** Version recorded for files that several harnesses share. Bump with the shared emitters. */
export const COMPILER_VERSION = '1.0.0'

export interface CompileOptions {
  /** Restrict to these targets; the default is every enabled target in `blueprint.targets`. */
  targets?: HarnessId[]
  /** Emit the repository README. Default true. */
  includeReadme?: boolean
}

export interface CompileOutput {
  blueprint: Blueprint
  /** Core validation plus adapter validation, sorted. */
  diagnostics: Diagnostic[]
  files: GeneratedFile[]
  issues: CompatibilityIssue[]
  /** Targets that were compiled, in blueprint order. */
  targets: HarnessId[]
  adapterVersions: Partial<Record<HarnessId, string>>
  /** False when any diagnostic is an error. */
  ok: boolean
}

export interface CompileProjectResult extends CompileOutput {
  buildManifest: BuildManifest
  sourceDir: string
}

export function enabledTargets(blueprint: Blueprint, requested?: HarnessId[]): HarnessId[] {
  const enabled = blueprint.targets
    .filter((target) => target.enabled)
    .map((target) => target.harnessId)
  if (!requested) return enabled
  // Keep the Blueprint's order so output does not depend on how the caller listed targets.
  const wanted = new Set(requested)
  const fromBlueprint = enabled.filter((id) => wanted.has(id))
  const extra = requested.filter((id) => !enabled.includes(id))
  return [...fromBlueprint, ...extra]
}

export function compileBlueprint(
  blueprint: Blueprint,
  options: CompileOptions = {},
): CompileOutput {
  const diagnostics: Diagnostic[] = [...validateBlueprint(blueprint)]
  const requested = enabledTargets(blueprint, options.targets)
  const produced: GeneratedFile[] = []
  const issues: CompatibilityIssue[] = []
  const adapterVersions: Partial<Record<HarnessId, string>> = {}
  /** Targets that actually produced output; a target with invalid options is not one. */
  const targets: HarnessId[] = []

  for (const harnessId of requested) {
    const adapter = adapterFor(harnessId)
    const config = blueprint.targets.find((target) => target.harnessId === harnessId)

    let parsedOptions: unknown
    try {
      parsedOptions = adapter.parseOptions(config?.options ?? {})
    } catch (error) {
      diagnostics.push({
        code: 'BP-TARGET-003',
        severity: 'error',
        message: `Options for target "${harnessId}" are invalid: ${
          error instanceof Error ? error.message : String(error)
        }. The target was skipped.`,
      })
      continue
    }

    adapterVersions[harnessId] = adapter.version
    targets.push(harnessId)
    diagnostics.push(...adapter.validate(blueprint, parsedOptions))
    const result = adapter.compile(blueprint, parsedOptions)
    produced.push(...result.files)
    issues.push(...result.issues)
  }

  if (options.includeReadme !== false && targets.length > 0) {
    produced.push(emitReadme(blueprint, targets))
  }

  const merged = mergeFileSets(produced)
  diagnostics.push(...merged.diagnostics)

  const sorted = sortDiagnostics(diagnostics)
  return {
    blueprint,
    diagnostics: sorted,
    files: merged.files,
    issues,
    targets,
    adapterVersions,
    ok: !sorted.some((diagnostic) => diagnostic.severity === 'error'),
  }
}

/**
 * Several adapters legitimately produce the same file (`AGENTS.md`, the `.agents/skills`
 * tree). Identical content is merged into one `shared` file; different content at the same
 * path is a bug in an adapter, so it is reported and neither version is written.
 */
export function mergeFileSets(files: readonly GeneratedFile[]): {
  files: GeneratedFile[]
  diagnostics: Diagnostic[]
} {
  const byPath = new Map<string, GeneratedFile[]>()
  for (const file of files) {
    const list = byPath.get(file.path)
    if (list) list.push(file)
    else byPath.set(file.path, [file])
  }

  const merged: GeneratedFile[] = []
  const diagnostics: Diagnostic[] = []

  for (const [path, group] of byPath) {
    const first = group[0]
    if (!first) continue
    if (group.length === 1) {
      merged.push(first)
      continue
    }

    if (group.some((file) => !sameFile(file.content, first.content))) {
      const owners = [...new Set(group.map((file) => file.owner))].sort()
      diagnostics.push({
        code: 'BP-COMPILE-001',
        severity: 'error',
        message: `${owners.join(' and ')} generate different content for ${path}. The file was not written; this is an adapter bug.`,
        path,
      })
      continue
    }

    const owners = new Set(group.map((file) => file.owner))
    merged.push({
      ...first,
      owner: owners.size === 1 ? first.owner : 'shared',
      sourceRefs: uniqueRefs(group.flatMap((file) => file.sourceRefs)),
    })
  }

  merged.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { files: merged, diagnostics }
}

function uniqueRefs(refs: EntityRef[]): EntityRef[] {
  const seen = new Set<string>()
  const out: EntityRef[] = []
  for (const ref of refs) {
    const key = refKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

/** Records which paths the compiler owns, so the next build can clean up after itself. */
export async function buildManifestFor(output: CompileOutput): Promise<BuildManifest> {
  const shared: BuildManifestTarget = { adapterVersion: COMPILER_VERSION, files: {} }
  const targets: Partial<Record<HarnessId, BuildManifestTarget>> = {}

  for (const file of output.files) {
    const hash = `sha256:${await sha256Hex(file.content)}`
    if (file.owner === 'shared') {
      shared.files[file.path] = hash
      continue
    }
    const entry = (targets[file.owner] ??= {
      adapterVersion: output.adapterVersions[file.owner] ?? COMPILER_VERSION,
      files: {},
    })
    entry.files[file.path] = hash
  }

  return {
    schemaVersion: 1,
    ...(Object.keys(shared.files).length > 0 ? { shared } : {}),
    targets,
  }
}

export async function compileProject(
  fs: VirtualFs,
  options: CompileOptions & { sourceDir?: string } = {},
): Promise<CompileProjectResult> {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR
  const { blueprint, diagnostics } = await readProject(fs, { sourceDir })
  const output = compileBlueprint(blueprint, options)
  const all = sortDiagnostics([...diagnostics, ...output.diagnostics])

  return {
    ...output,
    diagnostics: all,
    ok: !all.some((diagnostic) => diagnostic.severity === 'error'),
    buildManifest: await buildManifestFor(output),
    sourceDir,
  }
}

export interface WriteCompiledResult {
  written: string[]
  deleted: string[]
  /** Existing files the compiler does not own; the caller decides whether to overwrite. */
  skipped: string[]
  /** Owned files edited by hand since the last build; the edit was overwritten. */
  modifiedSinceBuild: string[]
  unchanged: string[]
}

/**
 * Writes generated files, deletes what the previous build owned and no longer produces, and
 * never silently overwrites a file it does not own.
 */
export async function writeCompiled(
  result: CompileProjectResult,
  fs: VirtualFs,
  previous?: BuildManifest,
): Promise<WriteCompiledResult> {
  const written: string[] = []
  const deleted: string[] = []
  const skipped: string[] = []
  const modifiedSinceBuild: string[] = []
  const unchanged: string[] = []

  const previousHashes = new Map<string, string>()
  for (const target of [previous?.shared, ...Object.values(previous?.targets ?? {})]) {
    for (const [path, hash] of Object.entries(target?.files ?? {})) previousHashes.set(path, hash)
  }

  for (const file of result.files) {
    const existing = await readFile(fs, file.path)
    if (existing === undefined) {
      await writeFile(fs, file.path, file.content)
      written.push(file.path)
      continue
    }
    if (sameFile(existing, file.content)) {
      unchanged.push(file.path)
      continue
    }
    const owned = previousHashes.get(file.path)
    if (owned === undefined) {
      // Not ours: a hand-written README or an instruction file that predates the Blueprint.
      skipped.push(file.path)
      continue
    }
    if (owned !== `sha256:${await sha256Hex(existing)}`) modifiedSinceBuild.push(file.path)
    await writeFile(fs, file.path, file.content)
    written.push(file.path)
  }

  const producedPaths = new Set(result.files.map((file) => file.path))
  for (const path of previousHashes.keys()) {
    if (producedPaths.has(path)) continue
    if (!(await fs.exists(path))) continue
    await fs.delete(path)
    deleted.push(path)
  }

  await fs.write(buildManifestPath(result.sourceDir), canonicalJson(result.buildManifest))

  return {
    written: written.sort(),
    deleted: deleted.sort(),
    skipped: skipped.sort(),
    modifiedSinceBuild: modifiedSinceBuild.sort(),
    unchanged: unchanged.sort(),
  }
}

/** Reads the manifest written by a previous build, if any. */
export async function readBuildManifest(
  fs: VirtualFs,
  sourceDir: string = DEFAULT_SOURCE_DIR,
): Promise<BuildManifest | undefined> {
  const text = await fs.read(buildManifestPath(sourceDir))
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as BuildManifest
  } catch {
    return undefined
  }
}
