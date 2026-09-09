/**
 * Deciding what the model gets to see.
 *
 * A Blueprint is bigger than a context window long before it is big enough to be interesting,
 * so this is a budgeting problem, and the order matters more than the arithmetic: the thing
 * being edited comes first, then what touches it, then what is already known to be wrong with
 * it, then everything else by name only. The bodies of unrelated artifacts come last, because
 * they are the blocks worth losing.
 *
 * Whatever is cut is recorded rather than silently dropped. If the selection or its neighbours
 * had to be trimmed, the answer is being given on partial information, and the UI says so
 * instead of the user wondering why the model ignored half their skill.
 */
import {
  type AnyEntity,
  type Blueprint,
  buildDependencyGraph,
  type Diagnostic,
  type EntityKind,
  ENTITY_KINDS,
  type EntityRef,
  findEntity,
  getCollection,
  refKey,
} from '@agent-blueprint/core'

import {
  DEFAULT_BUDGET,
  type ContextBudget,
  estimateTokens,
  inputAllowance,
  truncateToTokens,
} from '../tokens'
import {
  NEIGHBOUR_BODY_CHARS,
  renderEntity,
  renderRef,
  renderSummary,
  renderWorkflows,
} from './render'

/** The levels, in the order they are spent. Lower numbers are kept longer. */
export const CONTEXT_LEVELS = [
  'preamble',
  'selection',
  'neighbours',
  'diagnostics',
  'summary',
  'workflows',
  'bodies',
] as const

export type ContextLevel = (typeof CONTEXT_LEVELS)[number]

/** Levels whose loss changes the answer, rather than merely narrowing it. */
const LOAD_BEARING: readonly ContextLevel[] = ['selection', 'neighbours', 'diagnostics']

export interface BuildContextOptions {
  blueprint: Blueprint
  /** The artifact the user is looking at, if any. */
  selection?: EntityRef
  /** Findings core already computed, so the model is not asked to re-derive them. */
  diagnostics?: readonly Diagnostic[]
  /** Text that must be present whatever else is dropped, such as the glossary. */
  preamble?: string
  budget?: ContextBudget
}

export interface BuiltContext {
  text: string
  tokens: number
  /** Levels left out entirely. */
  omitted: ContextLevel[]
  /** Levels that were included but cut short. */
  truncated: ContextLevel[]
  /** True when something the answer depends on was cut, which the UI should say. */
  trimmed: boolean
}

interface Block {
  level: ContextLevel
  text: string
}

export function buildContext(options: BuildContextOptions): BuiltContext {
  const budget = options.budget ?? DEFAULT_BUDGET
  const allowance = inputAllowance(budget)
  const blocks = collectBlocks(options)

  const kept: string[] = []
  const omitted: ContextLevel[] = []
  const truncated: ContextLevel[] = []
  let spent = 0

  for (const block of blocks) {
    const cost = estimateTokens(block.text) + 2 // the blank line between blocks
    const room = allowance - spent
    if (block.level === 'preamble' || cost <= room) {
      kept.push(block.text)
      spent += cost
      continue
    }
    // A block worth a paragraph is worth truncating; anything smaller is just noise.
    if (room > 200) {
      kept.push(truncateToTokens(block.text, room - 2))
      truncated.push(block.level)
      spent = allowance
      continue
    }
    omitted.push(block.level)
  }

  const text = kept.join('\n\n')
  const hurt = [...omitted, ...truncated].some((level) => LOAD_BEARING.includes(level))
  return { text, tokens: estimateTokens(text), omitted, truncated, trimmed: hurt }
}

function collectBlocks(options: BuildContextOptions): Block[] {
  const bp = options.blueprint
  const blocks: Block[] = []
  const shown = new Set<string>()

  if (options.preamble) blocks.push({ level: 'preamble', text: options.preamble })

  const selected = options.selection
    ? findEntity(bp, options.selection.kind, options.selection.id)
    : undefined
  if (options.selection && selected) {
    shown.add(refKey(options.selection))
    blocks.push({
      level: 'selection',
      text: `# Selected artifact\n\n${renderEntity(options.selection.kind, selected)}`,
    })
  }

  if (options.selection && selected) {
    const neighbours = oneHop(bp, options.selection)
    const rendered = neighbours
      .filter((entry) => !shown.has(refKey(entry.ref)))
      .map((entry) => {
        shown.add(refKey(entry.ref))
        return `## ${entry.relation} ${renderRef(entry.ref)}\n\n${renderEntity(entry.ref.kind, entry.entity, { bodyChars: NEIGHBOUR_BODY_CHARS })}`
      })
    if (rendered.length > 0) {
      blocks.push({
        level: 'neighbours',
        text: `# What the selected artifact touches\n\n${rendered.join('\n\n')}`,
      })
    }
  }

  const relevant = relevantDiagnostics(options.diagnostics ?? [], options.selection)
  if (relevant.length > 0) {
    blocks.push({
      level: 'diagnostics',
      text: [
        '# Findings already computed (do not re-derive these)',
        ...relevant.map(
          (finding) =>
            `- [${finding.severity}] ${finding.code}${finding.ref ? ` ${renderRef(finding.ref)}` : ''}: ${finding.message}`,
        ),
      ].join('\n'),
    })
  }

  blocks.push({ level: 'summary', text: renderSummary(bp) })

  const workflows = renderWorkflows(bp.workflows)
  if (workflows) blocks.push({ level: 'workflows', text: workflows })

  const bodies = remainingBodies(bp, shown)
  if (bodies) blocks.push({ level: 'bodies', text: bodies })

  return blocks
}

interface Neighbour {
  ref: EntityRef
  entity: AnyEntity
  relation: 'uses' | 'used by'
}

/** What the selection points at and what points at it — one hop, no further. */
function oneHop(bp: Blueprint, ref: EntityRef): Neighbour[] {
  const graph = buildDependencyGraph(bp)
  const out: Neighbour[] = []
  const seen = new Set<string>([refKey(ref)])
  const add = (target: EntityRef, relation: Neighbour['relation']) => {
    if (seen.has(refKey(target))) return
    const entity = findEntity(bp, target.kind, target.id)
    if (!entity) return
    seen.add(refKey(target))
    out.push({ ref: target, entity, relation })
  }
  for (const edge of graph.dependenciesOf(ref)) add(edge.to, 'uses')
  for (const edge of graph.dependentsOf(ref)) add(edge.from, 'used by')
  return out
}

function relevantDiagnostics(
  diagnostics: readonly Diagnostic[],
  selection: EntityRef | undefined,
): Diagnostic[] {
  if (!selection) return [...diagnostics]
  const key = refKey(selection)
  const about = diagnostics.filter((finding) => finding.ref && refKey(finding.ref) === key)
  // With nothing said about this artifact, the project-wide errors are still worth knowing.
  return about.length > 0 ? about : diagnostics.filter((finding) => finding.severity === 'error')
}

/** Bodies not yet shown, largest first: the blocks that are cut when the budget runs out. */
function remainingBodies(bp: Blueprint, shown: ReadonlySet<string>): string {
  const entries: { kind: EntityKind; entity: AnyEntity; body: string }[] = []
  for (const kind of ENTITY_KINDS) {
    for (const entity of getCollection(bp, kind)) {
      if (shown.has(refKey({ kind, id: entity.id }))) continue
      const body = (entity as { body?: string }).body
      if (body) entries.push({ kind, entity, body })
    }
  }
  if (entries.length === 0) return ''
  entries.sort((a, b) => b.body.length - a.body.length || a.entity.id.localeCompare(b.entity.id))
  return [
    '# Artifact bodies',
    ...entries.map((entry) => renderEntity(entry.kind, entry.entity)),
  ].join('\n\n')
}
