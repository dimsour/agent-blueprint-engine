/**
 * Emits one skill directory in the Agent Skills format
 * (https://agentskills.io/specification), which every supported harness reads.
 *
 * Spec frontmatter fields come first and in spec order; harness extras follow. Attached
 * references are copied into the skill's own `references/` directory so a skill stays
 * self-contained: a harness that loads only that directory still has everything.
 */
import {
  type Blueprint,
  type EntityRef,
  fromBase64,
  type HarnessId,
  type Reference,
  type Skill,
} from '@agent-blueprint/core'

import { generatedFile, type GeneratedFile } from '../types'
import { type Frontmatter, markdownWithFrontmatter } from './frontmatter'
import { withHeader } from './header'
import { code, joinList } from './markdown'

export interface SkillDirOptions {
  /** Directory holding skill directories, e.g. `.claude/skills`. */
  root: string
  owner: HarnessId | 'shared'
  /** Harness-specific frontmatter written after the spec fields. */
  extraFrontmatter?: Frontmatter
  /** Values for `allowed-tools`, already translated to this harness's tool names. */
  allowedTools?: string[]
  /** Render activation conditions into the body (for harnesses with no `paths` field). */
  renderActivation?: boolean
  /** Source path recorded in the generated-file header. */
  sourcePath?: string
}

export interface SkillDirResult {
  files: GeneratedFile[]
  /** Descriptions longer than the spec limit, reported by the caller as diagnostics. */
  warnings: string[]
}

export const SKILL_DESCRIPTION_LIMIT = 1024

export function emitSkillDir(
  skill: Skill,
  blueprint: Blueprint,
  options: SkillDirOptions,
): SkillDirResult {
  const dir = `${options.root}/${skill.id}`
  const ref: EntityRef = { kind: 'skill', id: skill.id }
  const warnings: string[] = []

  const description = skill.description ?? ''
  if (description.length > SKILL_DESCRIPTION_LIMIT) {
    warnings.push(
      `Skill "${skill.name}" has a ${description.length}-character description; the Agent Skills limit is ${SKILL_DESCRIPTION_LIMIT}.`,
    )
  }

  const frontmatter: Frontmatter = {
    name: skill.id,
    description: description.slice(0, SKILL_DESCRIPTION_LIMIT),
    ...(options.allowedTools && options.allowedTools.length > 0
      ? { 'allowed-tools': options.allowedTools }
      : {}),
    ...stringMetadata(skill),
    ...(options.extraFrontmatter ?? {}),
  }

  const body = options.renderActivation
    ? [activationBlock(skill), skill.body].filter((part) => part.length > 0).join('\n\n')
    : skill.body

  const files: GeneratedFile[] = [
    generatedFile(
      `${dir}/SKILL.md`,
      markdownWithFrontmatter(
        frontmatter,
        body,
        options.sourcePath ?? `blueprint/skills/${skill.id}/SKILL.md`,
      ),
      'markdown',
      options.owner,
      [ref],
    ),
  ]

  for (const resource of skill.resources) {
    // Scripts and assets are copied verbatim: an HTML comment would corrupt them. A resource
    // that is not text is copied as its bytes, for the same reason and more so.
    if (resource.encoding === 'base64') {
      files.push(
        generatedFile(
          `${dir}/${resource.path}`,
          fromBase64(resource.content),
          'binary',
          options.owner,
          [ref],
        ),
      )
      continue
    }
    const isMarkdown = resource.path.endsWith('.md')
    const source = `blueprint/skills/${skill.id}/${resource.path}`
    files.push(
      generatedFile(
        `${dir}/${resource.path}`,
        isMarkdown ? `${withHeader(source, resource.content)}\n` : `${resource.content}\n`,
        isMarkdown ? 'markdown' : 'text',
        options.owner,
        [ref],
      ),
    )
  }

  for (const referenceId of skill.referenceIds) {
    const reference = blueprint.references.find((r) => r.id === referenceId)
    if (!reference) continue
    files.push(
      generatedFile(
        `${dir}/references/${reference.id}.md`,
        renderReference(reference),
        'markdown',
        options.owner,
        [ref, { kind: 'reference', id: reference.id }],
      ),
    )
  }

  return { files, warnings }
}

/** The spec allows only string values in `metadata`; anything else is authoring-time data. */
function stringMetadata(skill: Skill): { metadata?: Record<string, string> } {
  const entries = Object.entries(skill.metadata).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  return entries.length > 0 ? { metadata: Object.fromEntries(entries) } : {}
}

/**
 * A compact statement of when the skill applies, for harnesses that have no structured
 * activation fields. The conditions are a disjunction: any match activates the skill.
 */
export function activationBlock(skill: Skill): string {
  const lines: string[] = []
  if (skill.whenToUse) lines.push(`**When to use:** ${skill.whenToUse}`)

  const { activation } = skill
  const conditions: string[] = []
  if (activation.filePatterns.length > 0) {
    conditions.push(`files matching ${activation.filePatterns.map(code).join(', ')}`)
  }
  if (activation.directories.length > 0) {
    conditions.push(`work under ${activation.directories.map(code).join(', ')}`)
  }
  if (activation.fileTypes.length > 0) conditions.push(`${joinList(activation.fileTypes)} code`)
  if (activation.intents.length > 0) {
    conditions.push(`requests like ${activation.intents.map((i) => `"${i}"`).join(', ')}`)
  }
  if (activation.workflowIds.length > 0) {
    conditions.push(`the ${activation.workflowIds.map(code).join(', ')} workflow`)
  }
  if (conditions.length > 0) lines.push(`**Applies to:** ${joinList(conditions)}.`)
  if (skill.invocation.argumentHint) {
    lines.push(`**Argument:** ${code(skill.invocation.argumentHint)}`)
  }

  return lines.join('\n')
}

export function renderReference(reference: Reference): string {
  const parts = [`# ${reference.name}`]
  if (reference.description) parts.push(reference.description)
  if (reference.url) parts.push(`Source: ${reference.url}`)
  if (reference.body.trim().length > 0) parts.push(reference.body.trim())
  return `${withHeader(`blueprint/references/${reference.id}.md`, parts.join('\n\n'))}\n`
}
