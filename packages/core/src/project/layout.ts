/**
 * Where each artifact lives inside the blueprint source directory.
 *
 * ```
 * <sourceDir>/
 *   blueprint.yaml                 manifest
 *   agents/<id>.md                 markdown kinds (agents, laws, rules, references, memory, requirements)
 *   skills/<id>/SKILL.md           + <id>/<resource path>
 *   workflows/<id>.md              description + triggers
 *   workflows/<id>.workflow.json   graph
 *   hooks/<id>.yaml                yaml kinds (hooks, gates, tools, scenarios)
 *   build-manifest.json            compiler-owned output files (written by exporters)
 * ```
 */
import { ENTITY_KIND_INFO, type EntityKind, kindForDir } from '../model/kinds'
import { joinPath } from './virtual-fs'

export const MANIFEST_FILE = 'blueprint.yaml'
export const BUILD_MANIFEST_FILE = 'build-manifest.json'
export const SKILL_FILE = 'SKILL.md'
export const WORKFLOW_GRAPH_SUFFIX = '.workflow.json'

export function manifestPath(sourceDir: string): string {
  return joinPath(sourceDir, MANIFEST_FILE)
}

export function buildManifestPath(sourceDir: string): string {
  return joinPath(sourceDir, BUILD_MANIFEST_FILE)
}

export function kindDir(sourceDir: string, kind: EntityKind): string {
  return joinPath(sourceDir, ENTITY_KIND_INFO[kind].dir)
}

/** Path of the entity's main file. */
export function entityMainPath(sourceDir: string, kind: EntityKind, id: string): string {
  const info = ENTITY_KIND_INFO[kind]
  switch (info.format) {
    case 'markdown':
    case 'workflow':
      return joinPath(sourceDir, info.dir, `${id}.md`)
    case 'skill':
      return joinPath(sourceDir, info.dir, id, SKILL_FILE)
    case 'yaml':
      return joinPath(sourceDir, info.dir, `${id}.yaml`)
  }
}

export function workflowGraphPath(sourceDir: string, id: string): string {
  return joinPath(sourceDir, ENTITY_KIND_INFO.workflow.dir, `${id}${WORKFLOW_GRAPH_SUFFIX}`)
}

export function skillResourcePath(
  sourceDir: string,
  skillId: string,
  resourcePath: string,
): string {
  return joinPath(sourceDir, ENTITY_KIND_INFO.skill.dir, skillId, resourcePath)
}

export type ParsedEntityPath =
  | { kind: EntityKind; id: string; role: 'main' }
  | { kind: 'workflow'; id: string; role: 'graph' }
  | { kind: 'skill'; id: string; role: 'resource'; resourcePath: string }

/** Inverse of the path helpers. Returns `undefined` for files that are not artifacts. */
export function parseEntityPath(sourceDir: string, path: string): ParsedEntityPath | undefined {
  const prefix = sourceDir === '' ? '' : `${sourceDir}/`
  if (!path.startsWith(prefix)) return undefined
  const rel = path.slice(prefix.length)
  const [dir, ...rest] = rel.split('/')
  if (!dir || rest.length === 0) return undefined
  const kind = kindForDir(dir)
  if (!kind) return undefined
  const info = ENTITY_KIND_INFO[kind]

  switch (info.format) {
    case 'markdown': {
      const file = rest[0]
      if (rest.length !== 1 || !file?.endsWith('.md')) return undefined
      return { kind, id: file.slice(0, -'.md'.length), role: 'main' }
    }
    case 'yaml': {
      const file = rest[0]
      if (rest.length !== 1 || !file?.endsWith('.yaml')) return undefined
      return { kind, id: file.slice(0, -'.yaml'.length), role: 'main' }
    }
    case 'workflow': {
      const file = rest[0]
      if (rest.length !== 1 || !file) return undefined
      if (file.endsWith(WORKFLOW_GRAPH_SUFFIX)) {
        return { kind: 'workflow', id: file.slice(0, -WORKFLOW_GRAPH_SUFFIX.length), role: 'graph' }
      }
      if (file.endsWith('.md'))
        return { kind: 'workflow', id: file.slice(0, -'.md'.length), role: 'main' }
      return undefined
    }
    case 'skill': {
      const [id, ...inner] = rest
      if (!id || inner.length === 0) return undefined
      const resourcePath = inner.join('/')
      if (resourcePath === SKILL_FILE) return { kind: 'skill', id, role: 'main' }
      return { kind: 'skill', id, role: 'resource', resourcePath }
    }
  }
}
