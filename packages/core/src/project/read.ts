import type { ZodError } from 'zod'

import { normalizeBlueprint } from '../blueprint/normalize'
import { ENTITY_KIND_INFO, ENTITY_KINDS, type EntityKind } from '../model/kinds'
import type { Blueprint, EntityRef, Manifest, SkillResource } from '../model/types'
import { migrateEntity, migrateManifest } from '../migrations/index'
import {
  BLUEPRINT_SCHEMA_VERSION,
  DEFAULT_SOURCE_DIR,
  entitySchemaFor,
  manifestSchema,
} from '../schema/index'
import type { Diagnostic } from '../validation/types'
import { entityMainPath, kindDir, manifestPath, parseEntityPath, workflowGraphPath } from './layout'
import { decodeUtf8, toBase64 } from './binary'
import { decodeFrontmatter, fromYaml, isJsonValue } from './serialize'
import type { VirtualFs } from './virtual-fs'

export class ProjectReadError extends Error {
  constructor(
    message: string,
    readonly code: 'MANIFEST_MISSING' | 'MANIFEST_INVALID' | 'UNSUPPORTED_SCHEMA_VERSION',
    readonly path?: string,
  ) {
    super(message)
    this.name = 'ProjectReadError'
  }
}

export interface ReadProjectOptions {
  /** Directory holding `blueprint.yaml`. Defaults to `blueprint`. */
  sourceDir?: string
}

export interface ReadProjectResult {
  blueprint: Blueprint
  /** Problems found while reading. Entities with errors are omitted from the Blueprint. */
  diagnostics: Diagnostic[]
  /** Schema version found on disk before migration. */
  sourceSchemaVersion: string
}

export const PROJECT_DIAGNOSTICS = {
  ARTIFACT_MISSING: 'BP-PROJECT-002',
  ARTIFACT_INVALID: 'BP-PROJECT-003',
  ARTIFACT_UNLISTED: 'BP-PROJECT-004',
  UNKNOWN_KEYS_KEPT: 'BP-PROJECT-005',
  SOURCE_DIR_MISMATCH: 'BP-PROJECT-006',
} as const

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}

function inferResourceKind(path: string): SkillResource['kind'] {
  if (path.startsWith('scripts/')) return 'script'
  if (path.startsWith('assets/')) return 'asset'
  return 'reference'
}

/**
 * Load a project from a file system into a Blueprint.
 *
 * Tolerant by design: a broken artifact produces an error diagnostic and is skipped rather
 * than failing the whole load, so the UI can show the problem in place. A missing or
 * unparsable manifest is fatal because nothing else can be interpreted without it.
 */
export async function readProject(
  fs: VirtualFs,
  options: ReadProjectOptions = {},
): Promise<ReadProjectResult> {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR
  const diagnostics: Diagnostic[] = []

  const manifestFile = manifestPath(sourceDir)
  const manifestText = await fs.read(manifestFile)
  if (manifestText === undefined) {
    throw new ProjectReadError(`No ${manifestFile} found`, 'MANIFEST_MISSING', manifestFile)
  }

  let rawManifest: unknown
  try {
    rawManifest = fromYaml(manifestText)
  } catch (error) {
    throw new ProjectReadError(
      `Cannot parse ${manifestFile}: ${String(error)}`,
      'MANIFEST_INVALID',
      manifestFile,
    )
  }
  if (rawManifest === null || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    throw new ProjectReadError(
      `${manifestFile} must be a YAML mapping`,
      'MANIFEST_INVALID',
      manifestFile,
    )
  }

  const rawVersion = (rawManifest as Record<string, unknown>).schemaVersion
  const sourceSchemaVersion =
    typeof rawVersion === 'string' || typeof rawVersion === 'number' ? String(rawVersion) : ''
  const migratedManifest = migrateManifest(rawManifest as Record<string, unknown>)
  const parsedManifest = manifestSchema.safeParse(migratedManifest)
  if (!parsedManifest.success) {
    throw new ProjectReadError(
      `${manifestFile} is invalid: ${formatZodError(parsedManifest.error)}`,
      'MANIFEST_INVALID',
      manifestFile,
    )
  }
  const manifest: Manifest = parsedManifest.data

  if (manifest.settings.sourceDir !== sourceDir) {
    diagnostics.push({
      code: PROJECT_DIAGNOSTICS.SOURCE_DIR_MISMATCH,
      severity: 'info',
      message: `Manifest declares sourceDir "${manifest.settings.sourceDir}" but the project was read from "${sourceDir}"; using "${sourceDir}".`,
      path: manifestFile,
    })
  }

  const collections: Record<string, unknown[]> = {}
  for (const kind of ENTITY_KINDS) {
    const info = ENTITY_KIND_INFO[kind]
    const listed = manifest.artifacts[info.collection]
    const discovered = await discoverIds(fs, sourceDir, kind)
    const ids = [...listed]
    for (const id of discovered) {
      if (listed.includes(id)) continue
      ids.push(id)
      diagnostics.push({
        code: PROJECT_DIAGNOSTICS.ARTIFACT_UNLISTED,
        severity: 'warning',
        message: `${info.label} "${id}" exists on disk but is not listed in ${manifestFile}; it was appended.`,
        ref: { kind, id },
        path: entityMainPath(sourceDir, kind, id),
      })
    }

    const entities: unknown[] = []
    for (const id of ids) {
      const entity = await readEntity(fs, sourceDir, kind, id, diagnostics)
      if (entity !== undefined) entities.push(entity)
    }
    collections[info.collection] = entities
  }

  const blueprint = normalizeBlueprint({
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
    settings: { ...manifest.settings, sourceDir },
    targets: manifest.targets,
    ...collections,
  })

  return { blueprint, diagnostics, sourceSchemaVersion }
}

async function discoverIds(fs: VirtualFs, sourceDir: string, kind: EntityKind): Promise<string[]> {
  const ids = new Set<string>()
  for (const path of await fs.list(kindDir(sourceDir, kind))) {
    const parsed = parseEntityPath(sourceDir, path)
    if (parsed?.kind === kind && parsed.role === 'main') ids.add(parsed.id)
  }
  return Array.from(ids).sort()
}

async function readEntity(
  fs: VirtualFs,
  sourceDir: string,
  kind: EntityKind,
  id: string,
  diagnostics: Diagnostic[],
): Promise<unknown> {
  const info = ENTITY_KIND_INFO[kind]
  const ref: EntityRef = { kind, id }
  const mainPath = entityMainPath(sourceDir, kind, id)
  const text = await fs.read(mainPath)
  if (text === undefined) {
    diagnostics.push({
      code: PROJECT_DIAGNOSTICS.ARTIFACT_MISSING,
      severity: 'error',
      message: `${info.label} "${id}" is listed in the manifest but ${mainPath} does not exist.`,
      ref,
      path: mainPath,
    })
    return undefined
  }

  let raw: Record<string, unknown>
  try {
    switch (info.format) {
      case 'yaml': {
        const parsed = fromYaml(text)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('file must be a YAML mapping')
        }
        raw = { ...(parsed as Record<string, unknown>) }
        break
      }
      case 'markdown': {
        const doc = decodeFrontmatter(text)
        raw = { ...doc.data, body: doc.body }
        break
      }
      case 'skill': {
        const doc = decodeFrontmatter(text)
        raw = {
          ...doc.data,
          body: doc.body,
          resources: await readSkillResources(fs, sourceDir, id),
        }
        break
      }
      case 'workflow': {
        const doc = decodeFrontmatter(text)
        const graphPath = workflowGraphPath(sourceDir, id)
        const graphText = await fs.read(graphPath)
        const graph =
          graphText === undefined ? {} : (JSON.parse(graphText) as Record<string, unknown>)
        raw = { ...doc.data, ...graph, body: doc.body }
        break
      }
    }
  } catch (error) {
    diagnostics.push({
      code: PROJECT_DIAGNOSTICS.ARTIFACT_INVALID,
      severity: 'error',
      message: `${info.label} "${id}" could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      ref,
      path: mainPath,
    })
    return undefined
  }

  raw.id = id
  raw = migrateEntity(kind, raw)

  // Preserve unknown keys under metadata so that round-trips never drop information.
  const schema = entitySchemaFor(kind)
  const known = new Set(Object.keys(schema.shape))
  const unknownKeys = Object.keys(raw).filter((key) => !known.has(key))
  if (unknownKeys.length > 0) {
    const metadata = { ...((raw.metadata as Record<string, unknown> | undefined) ?? {}) }
    for (const key of unknownKeys) {
      const value = raw[key]
      if (isJsonValue(value) && !(key in metadata)) metadata[key] = value
      delete raw[key]
    }
    raw.metadata = metadata
    diagnostics.push({
      code: PROJECT_DIAGNOSTICS.UNKNOWN_KEYS_KEPT,
      severity: 'info',
      message: `${info.label} "${id}" has unknown keys (${unknownKeys.join(', ')}); they were kept under metadata.`,
      ref,
      path: mainPath,
    })
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    diagnostics.push({
      code: PROJECT_DIAGNOSTICS.ARTIFACT_INVALID,
      severity: 'error',
      message: `${info.label} "${id}" is invalid: ${formatZodError(parsed.error)}`,
      ref,
      path: mainPath,
    })
    return undefined
  }
  return parsed.data
}

async function readSkillResources(
  fs: VirtualFs,
  sourceDir: string,
  skillId: string,
): Promise<SkillResource[]> {
  const resources: SkillResource[] = []
  for (const path of await fs.list(`${kindDir(sourceDir, 'skill')}/${skillId}`)) {
    const parsed = parseEntityPath(sourceDir, path)
    if (parsed?.kind !== 'skill' || parsed.role !== 'resource' || parsed.id !== skillId) continue
    // Read the bytes and let the content decide: an extension list would get a `.dat` full of
    // text wrong in one direction and a `.md` full of bytes wrong in the other.
    const bytes = (await fs.readBinary(path)) ?? new Uint8Array()
    const text = decodeUtf8(bytes)
    resources.push({
      path: parsed.resourcePath,
      kind: inferResourceKind(parsed.resourcePath),
      ...(text === undefined
        ? { encoding: 'base64' as const, content: toBase64(bytes) }
        : { encoding: 'utf8' as const, content: text }),
    })
  }
  return resources
}
