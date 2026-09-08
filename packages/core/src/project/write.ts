import { normalizeBlueprint } from '../blueprint/normalize'
import { getCollection } from '../blueprint/entities'
import { ENTITY_KIND_INFO, ENTITY_KINDS, type EntityKind } from '../model/kinds'
import type { AnyEntity, Blueprint, ManifestInput, Skill, Workflow } from '../model/types'
import { entitySchemaFor, manifestSchema, workflowSchema } from '../schema/index'
import {
  entityMainPath,
  kindDir,
  manifestPath,
  parseEntityPath,
  skillResourcePath,
  workflowGraphPath,
} from './layout'
import { encodeFrontmatter, pruneEmpty, stableJson, toYaml } from './serialize'
import { stripDefaults } from './strip-defaults'
import type { VirtualFs } from './virtual-fs'

/** Keys that never go into a file's data section: the id is the file name, the body is the file body. */
const EXCLUDED_KEYS = new Set(['id', 'body'])

/**
 * Data section of an entity: schema key order, without id/body, without values that equal
 * their schema default and without empty values. Because the entity has been through its
 * Zod schema, nested objects are already in schema key order too.
 */
function entityData(
  kind: EntityKind,
  entity: AnyEntity,
  exclude: ReadonlySet<string> = EXCLUDED_KEYS,
): Record<string, unknown> {
  const schema = entitySchemaFor(kind)
  const stripped = (stripDefaults(entity, schema) ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  for (const key of Object.keys(schema.shape)) {
    if (exclude.has(key)) continue
    const value = pruneEmpty(stripped[key])
    if (value !== undefined) data[key] = value
  }
  return data
}

const SKILL_EXCLUDED = new Set([...EXCLUDED_KEYS, 'resources'])
const WORKFLOW_MD_EXCLUDED = new Set([...EXCLUDED_KEYS, 'entryNodeId', 'nodes', 'edges'])
const WORKFLOW_GRAPH_KEYS = ['entryNodeId', 'nodes', 'edges'] as const

function renderSkill(sourceDir: string, skill: Skill, files: Record<string, string>): void {
  files[entityMainPath(sourceDir, 'skill', skill.id)] = encodeFrontmatter(
    entityData('skill', skill, SKILL_EXCLUDED),
    skill.body,
  )
  for (const resource of skill.resources) {
    files[skillResourcePath(sourceDir, skill.id, resource.path)] = `${resource.content}\n`
  }
}

function renderWorkflow(
  sourceDir: string,
  workflow: Workflow,
  files: Record<string, string>,
): void {
  files[entityMainPath(sourceDir, 'workflow', workflow.id)] = encodeFrontmatter(
    entityData('workflow', workflow, WORKFLOW_MD_EXCLUDED),
    workflow.body,
  )
  const stripped = (stripDefaults(workflow, workflowSchema) ?? {}) as Record<string, unknown>
  const graph: Record<string, unknown> = {}
  for (const key of WORKFLOW_GRAPH_KEYS) {
    const value = pruneEmpty(stripped[key])
    if (value !== undefined) graph[key] = value
  }
  files[workflowGraphPath(sourceDir, workflow.id)] = stableJson(graph)
}

function renderManifest(bp: Blueprint): string {
  const manifest: ManifestInput = {
    schemaVersion: bp.schemaVersion,
    id: bp.id,
    name: bp.name,
    version: bp.version,
    ...(bp.description !== undefined ? { description: bp.description } : {}),
    settings: bp.settings,
    targets: bp.targets,
    artifacts: Object.fromEntries(
      ENTITY_KINDS.map((kind) => [
        ENTITY_KIND_INFO[kind].collection,
        getCollection(bp, kind).map((e) => e.id),
      ]),
    ),
  }
  // Round through the schema so key order is the schema's, then drop defaults and empties.
  const parsed = manifestSchema.parse(manifest)
  const stripped = (stripDefaults(parsed, manifestSchema) ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  for (const key of Object.keys(manifestSchema.shape)) {
    const value = pruneEmpty(stripped[key])
    if (value !== undefined) data[key] = value
  }
  // The project version is part of the manifest's identity; always write it.
  data.version = bp.version
  return toYaml(orderLike(Object.keys(manifestSchema.shape), data))
}

function orderLike(
  keys: readonly string[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) if (key in data) out[key] = data[key]
  for (const key of Object.keys(data)) if (!(key in out)) out[key] = data[key]
  return out
}

/**
 * Pure function: Blueprint → { path: content }. Normalizes first, so the output is identical
 * for any two Blueprints that are semantically equal.
 */
export function renderProjectFiles(
  input: Blueprint,
  options: { sourceDir?: string } = {},
): Record<string, string> {
  const bp = normalizeBlueprint(input)
  const sourceDir = options.sourceDir ?? bp.settings.sourceDir
  const files: Record<string, string> = {}

  files[manifestPath(sourceDir)] = renderManifest(bp)

  for (const kind of ENTITY_KINDS) {
    const info = ENTITY_KIND_INFO[kind]
    for (const entity of getCollection(bp, kind)) {
      switch (info.format) {
        case 'skill':
          renderSkill(sourceDir, entity as Skill, files)
          break
        case 'workflow':
          renderWorkflow(sourceDir, entity as Workflow, files)
          break
        case 'markdown':
          files[entityMainPath(sourceDir, kind, entity.id)] = encodeFrontmatter(
            entityData(kind, entity),
            (entity as { body: string }).body,
          )
          break
        case 'yaml':
          files[entityMainPath(sourceDir, kind, entity.id)] = toYaml(entityData(kind, entity))
          break
      }
    }
  }

  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

export interface WriteProjectOptions {
  sourceDir?: string
  /** Delete artifact files inside the source directory that were not produced (default: true). */
  prune?: boolean
}

export interface WriteProjectResult {
  written: string[]
  deleted: string[]
  unchanged: string[]
}

/** Write the project to `fs`, touching only files that changed and pruning stale artifacts. */
export async function writeProject(
  bp: Blueprint,
  fs: VirtualFs,
  options: WriteProjectOptions = {},
): Promise<WriteProjectResult> {
  const sourceDir = options.sourceDir ?? bp.settings.sourceDir
  const files = renderProjectFiles(bp, { sourceDir })
  const written: string[] = []
  const unchanged: string[] = []
  const deleted: string[] = []

  for (const [path, content] of Object.entries(files)) {
    const existing = await fs.read(path)
    if (existing === content) {
      unchanged.push(path)
      continue
    }
    await fs.write(path, content)
    written.push(path)
  }

  if (options.prune !== false) {
    for (const kind of ENTITY_KINDS) {
      for (const path of await fs.list(kindDir(sourceDir, kind))) {
        if (path in files) continue
        if (!parseEntityPath(sourceDir, path)) continue
        await fs.delete(path)
        deleted.push(path)
      }
    }
  }

  return { written, deleted, unchanged }
}
