/**
 * The portable artifact set: `AGENTS.md` and the `.agents/skills` tree.
 *
 * Codex, OpenCode and Pi all read these exact paths, and Copilot reads `AGENTS.md` too. A
 * file at one path can only have one content, so everything here is computed from the
 * Blueprint alone, with no harness-specific wording: the per-harness parts live in each
 * harness's own directory and in the generated README. The pipeline deduplicates the
 * identical copies the adapters produce and marks the result `shared`.
 */
import type { Agent, Blueprint, HarnessId } from '@agent-blueprint/core'

import { markdownWithFrontmatter } from './frontmatter'
import { composeInstructions, type InstructionsResult, primaryAgentOf } from './instructions'
import { code, Markdown } from './markdown'
import { type Phrasing, SHARED_PHRASING } from './phrasing'
import { emitSkillDir, renderReference } from './skill-dir'
import { emitWorkflowSkill } from './workflow-skill'
import { generatedFile, type GeneratedFile } from '../types'

/** Codex caps concatenated instructions at 32 KiB; the portable file stays under 30 KiB. */
export const PORTABLE_INSTRUCTIONS_MAX_BYTES = 30 * 1024

export const PORTABLE_SKILLS_DIR = '.agents/skills'
export const PORTABLE_REFERENCES_DIR = '.agents/references'
export const OVERFLOW_SKILL_ID = 'blueprint-guidelines'

/**
 * Permission intent as prose. Harnesses with a coarse or absent permission model cannot
 * enforce it, but the agent can still follow it, and stating it is the difference between a
 * documented boundary and none at all.
 */
export function commandPolicySection(agent: Agent | undefined): string | undefined {
  if (!agent) return undefined
  const never: string[] = []
  const ask: string[] = []
  const allowed: string[] = []

  const label: Record<string, string> = {
    'fs.read': 'read files',
    'fs.write': 'create or edit files',
    'fs.delete': 'delete files',
    'shell.readonly': 'run read-only shell commands',
    'shell.mutating': 'run shell commands that change state',
    'git.read': 'read git history',
    'git.commit': 'stage and commit',
    'git.push': 'push',
    'git.force-push': 'force-push',
    'net.docs': 'fetch documentation',
    'net.any': 'make arbitrary network requests',
    mcp: 'use MCP servers',
  }

  for (const [operation, decision] of Object.entries(agent.permissions.operations)) {
    const text = label[operation] ?? operation
    if (decision === 'deny') never.push(text)
    else if (decision === 'ask') ask.push(text)
  }
  for (const pattern of agent.permissions.patterns) {
    if (pattern.decision === 'allow') allowed.push(code(pattern.pattern))
    else if (pattern.decision === 'deny') never.push(`run ${code(pattern.pattern)}`)
    else ask.push(`run ${code(pattern.pattern)}`)
  }

  if (never.length === 0 && ask.length === 0 && allowed.length === 0) return undefined

  const md = new Markdown()
  const lines: string[] = []
  if (never.length > 0) lines.push(`**Never** ${never.join(', ')}.`)
  if (ask.length > 0) lines.push(`**Ask first** before you ${ask.join(', ')}.`)
  if (allowed.length > 0) lines.push(`**No need to ask** for ${allowed.join(', ')}.`)
  md.bullets(lines)
  return md.render()
}

export function portableInstructions(blueprint: Blueprint): InstructionsResult {
  const policy = commandPolicySection(primaryAgentOf(blueprint))
  return composeInstructions(blueprint, {
    phrasing: SHARED_PHRASING,
    sourcePath: 'blueprint/',
    nativePathScopedRules: false,
    memoryNative: false,
    maxBytes: PORTABLE_INSTRUCTIONS_MAX_BYTES,
    referenceLink: (referenceId) => `(${PORTABLE_REFERENCES_DIR}/${referenceId}.md)`,
    ...(policy ? { extraSections: [{ title: 'Command policy', body: policy }] } : {}),
  })
}

/** `AGENTS.md`, identical for every harness that reads it. */
export function emitPortableInstructionFile(blueprint: Blueprint): {
  file: GeneratedFile
  overflow: InstructionsResult['overflow']
} {
  const result = portableInstructions(blueprint)
  const primary = primaryAgentOf(blueprint)
  return {
    file: generatedFile('AGENTS.md', result.content, 'markdown', 'shared', [
      ...(primary ? [{ kind: 'agent' as const, id: primary.id }] : []),
    ]),
    overflow: result.overflow,
  }
}

export interface PortableSkillSetOptions {
  root: string
  owner: HarnessId | 'shared'
  /** Where loose references go; omit to skip them. */
  referencesDir?: string
  /** How workflow skills refer to skills and agents; neutral wording unless the tree is one harness's. */
  phrasing?: Phrasing
}

/**
 * Skills, workflow orchestration skills, the overflow skill and loose references, in the
 * Agent Skills format. Same input, same bytes, whichever adapter asks for them.
 */
export function emitPortableSkillSet(
  blueprint: Blueprint,
  options: PortableSkillSetOptions,
): { files: GeneratedFile[]; warnings: { skillId: string; message: string }[] } {
  const files: GeneratedFile[] = []
  const warnings: { skillId: string; message: string }[] = []

  for (const skill of blueprint.skills) {
    const result = emitSkillDir(skill, blueprint, {
      root: options.root,
      owner: options.owner,
      renderActivation: true,
      allowedTools: [],
    })
    files.push(...result.files)
    for (const message of result.warnings) warnings.push({ skillId: skill.id, message })
  }

  for (const workflow of blueprint.workflows) {
    const { body } = emitWorkflowSkill(workflow, blueprint, options.phrasing ?? SHARED_PHRASING)
    files.push(
      generatedFile(
        `${options.root}/${workflow.id}/SKILL.md`,
        markdownWithFrontmatter(
          { name: workflow.id, description: workflow.description ?? workflow.name },
          body,
          `blueprint/workflows/${workflow.id}.md`,
        ),
        'markdown',
        options.owner,
        [{ kind: 'workflow', id: workflow.id }],
      ),
    )
  }

  const { overflow } = portableInstructions(blueprint)
  if (overflow.length > 0) {
    const md = new Markdown()
    md.heading(1, 'Blueprint guidelines')
    md.paragraph(
      'Sections moved out of the root instruction file to keep it within the harness size limit. Read this skill when you need the detail.',
    )
    for (const section of overflow) {
      md.heading(2, section.title)
      md.raw(section.body)
    }
    files.push(
      generatedFile(
        `${options.root}/${OVERFLOW_SKILL_ID}/SKILL.md`,
        markdownWithFrontmatter(
          {
            name: OVERFLOW_SKILL_ID,
            description: `Rules, memory notes and references for ${blueprint.name} that did not fit in the root instruction file.`,
          },
          md.render(),
          'blueprint/',
        ),
        'markdown',
        options.owner,
        [],
      ),
    )
  }

  if (options.referencesDir) {
    const loose = blueprint.references.filter(
      (reference) => !blueprint.skills.some((skill) => skill.referenceIds.includes(reference.id)),
    )
    for (const reference of loose) {
      files.push(
        generatedFile(
          `${options.referencesDir}/${reference.id}.md`,
          renderReference(reference),
          'markdown',
          options.owner,
          [{ kind: 'reference', id: reference.id }],
        ),
      )
    }
  }

  return { files, warnings }
}

/** Rules whose globs are all plain directories can become a nested `AGENTS.md`. */
export function directoryScopedRules(blueprint: Blueprint): { dir: string; ruleIds: string[] }[] {
  const byDir = new Map<string, string[]>()
  for (const rule of blueprint.rules) {
    if (rule.paths.length === 0) continue
    const dirs = rule.paths.map(plainDirectory)
    if (dirs.some((dir) => dir === undefined)) continue
    for (const dir of dirs) {
      if (dir === undefined) continue
      const list = byDir.get(dir) ?? []
      if (!list.includes(rule.id)) list.push(rule.id)
      byDir.set(dir, list)
    }
  }
  return [...byDir.entries()]
    .map(([dir, ruleIds]) => ({ dir, ruleIds }))
    .sort((a, b) => (a.dir < b.dir ? -1 : 1))
}

/** `src/**` and `src/` are a directory; `**\/*.ts` is not. */
function plainDirectory(glob: string): string | undefined {
  const match = /^([A-Za-z0-9._@-]+(?:\/[A-Za-z0-9._@-]+)*)\/(?:\*\*\/?\*?|\*)?$/.exec(glob.trim())
  return match?.[1]
}
