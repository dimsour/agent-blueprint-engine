/**
 * The bridge between an artifact and its file.
 *
 * The Source tab shows exactly the bytes `renderProjectFiles` would write for one artifact,
 * and parses edits back through the same schema the writer used. That is the whole point:
 * the Markdown a user edits here is the Markdown that ends up in the repository, so there is
 * no third representation to drift.
 *
 * Some fields do not live in the main file. A skill's resources are sibling files and a
 * workflow's graph is a separate `.workflow.json`, so those are carried over from the
 * existing artifact rather than being lost when the file is parsed back.
 */
import {
  type AnyEntity,
  type Blueprint,
  decodeFrontmatter,
  ENTITY_KIND_INFO,
  entityMainPath,
  entitySchemaFor,
  type EntityRef,
  findEntity,
  fromYaml,
  renderProjectFiles,
} from '@agent-blueprint/core'

/** Where this artifact lives inside the project. */
export function sourcePathFor(blueprint: Blueprint, ref: EntityRef): string {
  return entityMainPath(blueprint.settings.sourceDir, ref.kind, ref.id)
}

/** The language of the artifact's main file, for the editor and the tab label. */
export function sourceLanguage(ref: EntityRef): 'markdown' | 'yaml' {
  return ENTITY_KIND_INFO[ref.kind].format === 'yaml' ? 'yaml' : 'markdown'
}

/** True when the artifact has a Markdown body worth previewing. */
export function hasPreview(ref: EntityRef): boolean {
  return sourceLanguage(ref) === 'markdown'
}

/** The artifact a ref points at, or undefined when it points at nothing. */
export function entityOf(blueprint: Blueprint, ref: EntityRef): AnyEntity | undefined {
  return findEntity(blueprint, ref.kind, ref.id)
}

/**
 * The file the writer would produce for this artifact, byte for byte. Always text: every
 * artifact main file is Markdown, YAML or JSON, and a skill resource is not an artifact.
 */
export function renderEntitySource(blueprint: Blueprint, ref: EntityRef): string {
  const content = renderProjectFiles(blueprint)[sourcePathFor(blueprint, ref)]
  return typeof content === 'string' ? content : ''
}

/** The Markdown body alone, for the preview. */
export function bodyOf(blueprint: Blueprint, ref: EntityRef): string {
  const entity = entityOf(blueprint, ref)
  const body = (entity as { body?: unknown } | undefined)?.body
  return typeof body === 'string' ? body : ''
}

export type ParseSourceResult = { ok: true; entity: AnyEntity } | { ok: false; message: string }

/**
 * Fields the writer deliberately leaves out of the main file. They come from the artifact
 * that is already loaded, so editing the file cannot silently drop a skill's resources or a
 * workflow's graph.
 */
function carriedOverFields(blueprint: Blueprint, ref: EntityRef): Record<string, unknown> {
  const existing = entityOf(blueprint, ref) as Record<string, unknown> | undefined
  if (!existing) return {}
  switch (ENTITY_KIND_INFO[ref.kind].format) {
    case 'skill':
      return { resources: existing['resources'] }
    case 'workflow':
      return {
        entryNodeId: existing['entryNodeId'],
        nodes: existing['nodes'],
        edges: existing['edges'],
      }
    default:
      return {}
  }
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message
}

/**
 * Parses an edited file back into an artifact. Anything the file does not mention returns to
 * its schema default, which is what makes deleting a line in the frontmatter do what a user
 * expects.
 */
export function parseEntitySource(
  blueprint: Blueprint,
  ref: EntityRef,
  text: string,
): ParseSourceResult {
  let raw: Record<string, unknown>

  try {
    if (sourceLanguage(ref) === 'yaml') {
      const parsed = fromYaml(text)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: 'The file must be a YAML mapping of fields.' }
      }
      raw = { ...(parsed as Record<string, unknown>) }
    } else {
      const document = decodeFrontmatter(text)
      raw = { ...document.data, body: document.body }
    }
  } catch (error) {
    return {
      ok: false,
      message: firstLine(error instanceof Error ? error.message : String(error)),
    }
  }

  // The id is the file name, not a field: renaming happens through renameEntity.
  const input = { ...raw, ...carriedOverFields(blueprint, ref), id: ref.id }
  const parsed = entitySchemaFor(ref.kind).safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path.map(String).join('.')
    return {
      ok: false,
      message: issue ? `${path ? `${path}: ` : ''}${issue.message}` : 'This artifact is not valid.',
    }
  }

  return { ok: true, entity: parsed.data as AnyEntity }
}
