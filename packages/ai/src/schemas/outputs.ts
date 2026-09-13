/**
 * The answer shape of each operation.
 *
 * Two kinds of answer exist. Operations that propose edits answer with artifacts, which are
 * the schemas in `./entities`; operations that report answer with findings, which name
 * artifacts by kind and id and say something about them. A finding whose ref does not exist is
 * dropped rather than shown, because a finding you cannot navigate to is noise.
 *
 * Where an operation can answer with more than one kind of artifact, the shape is a
 * discriminated union over just the kinds that operation is for. Offering all twelve would
 * make the schema larger than the Blueprint it is about, which matters on the endpoints that
 * have to read it in the prompt rather than enforce it on the wire.
 */
import { ENTITY_KINDS, type EntityKind, SEVERITIES } from '@agent-blueprint/core'
import { z } from 'zod'

import { AI_ENTITY_SCHEMAS } from './entities'

/**
 * Ask for the artifact's real shape, but keep whatever came back if it does not fit.
 *
 * The JSON Schema sent to the endpoint is unchanged, so the model is still told exactly what
 * a Skill is; what changes is the consequence of getting one field wrong in a list of twenty
 * artifacts. Without this, a rule missing its guidance costs a regeneration of the whole
 * Blueprint. With it, the assembler drops that one artifact and says so, and the other
 * nineteen reach the review — which is what the operation promises.
 */
function tolerant(schema: z.ZodType): z.ZodType<unknown> {
  return schema.catch((ctx: { value: unknown }) => ctx.value)
}

/** How an operation points at an artifact. Checked against the Blueprint afterwards. */
export const aiRefSchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  id: z.string(),
})

/** One proposed artifact, tagged with its kind, carrying why it is being proposed. */
export interface ProposalOf<K extends EntityKind> {
  kind: K
  /** Parsed against that kind's schema by the union below; re-parsed by core on assembly. */
  artifact: unknown
  /** The evidence: what in the input made this worth writing. */
  note?: string | undefined
}

/**
 * A union over just the kinds an operation may propose. The result is annotated rather than
 * inferred: the inferred type is a twelve-way union of entity shapes that no caller uses, and
 * that makes every downstream signature unreadable for no benefit.
 */
function proposalUnion<K extends EntityKind>(kinds: readonly K[]): z.ZodType<ProposalOf<K>> {
  const members = kinds.map((kind) =>
    z.object({
      kind: z.literal(kind),
      artifact: tolerant(AI_ENTITY_SCHEMAS[kind]),
      note: z.string().optional(),
    }),
  ) as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]
  return z.discriminatedUnion('kind', members) as unknown as z.ZodType<ProposalOf<K>>
}

export const generateBlueprintOutputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  /** Which agent's persona becomes the root instruction file. */
  primaryAgentId: z.string().optional(),
  agents: z.array(tolerant(AI_ENTITY_SCHEMAS.agent)).default([]),
  skills: z.array(tolerant(AI_ENTITY_SCHEMAS.skill)).default([]),
  workflows: z.array(tolerant(AI_ENTITY_SCHEMAS.workflow)).default([]),
  ironLaws: z.array(tolerant(AI_ENTITY_SCHEMAS['iron-law'])).default([]),
  rules: z.array(tolerant(AI_ENTITY_SCHEMAS.rule)).default([]),
  hooks: z.array(tolerant(AI_ENTITY_SCHEMAS.hook)).default([]),
  gates: z.array(tolerant(AI_ENTITY_SCHEMAS.gate)).default([]),
  tools: z.array(tolerant(AI_ENTITY_SCHEMAS.tool)).default([]),
  references: z.array(tolerant(AI_ENTITY_SCHEMAS.reference)).default([]),
  memories: z.array(tolerant(AI_ENTITY_SCHEMAS.memory)).default([]),
  requirements: z.array(tolerant(AI_ENTITY_SCHEMAS.requirement)).default([]),
})

/** One artifact of a kind the caller already chose. */
export function artifactOutputSchema<K extends EntityKind>(kind: K) {
  return z.object({
    artifact: AI_ENTITY_SCHEMAS[kind],
    /** What was written and why, shown above the diff. */
    note: z.string().optional(),
  })
}

export const createWorkflowOutputSchema = z.object({
  workflow: AI_ENTITY_SCHEMAS.workflow,
  note: z.string().optional(),
})

export const createIronLawsOutputSchema = z.object({
  ironLaws: z.array(tolerant(AI_ENTITY_SCHEMAS['iron-law'])).default([]),
})

export const contradictionSchema = z.object({
  first: aiRefSchema,
  second: aiRefSchema,
  /** What one requires and the other forbids, in a sentence. */
  conflict: z.string().min(1),
  /** Which of the two the author should probably change, and why. */
  recommendation: z.string().optional(),
  severity: z.enum(SEVERITIES).default('medium'),
})

export const findContradictionsOutputSchema = z.object({
  contradictions: z.array(contradictionSchema).default([]),
})

export const gapSchema = z.object({
  /** What is missing. */
  title: z.string().min(1),
  /** The artifact whose existence implies the gap. */
  implicatedBy: aiRefSchema.optional(),
  why: z.string().min(1),
  severity: z.enum(SEVERITIES).default('medium'),
})

export type Gap = z.infer<typeof gapSchema>

/** Kinds `findMissing` may propose: the ones a gap in an existing Blueprint usually needs. */
export const MISSING_PROPOSAL_KINDS = [
  'skill',
  'iron-law',
  'rule',
  'gate',
  'requirement',
  'reference',
] as const

export const findMissingOutputSchema = z.object({
  gaps: z.array(gapSchema).default([]),
  /** Artifacts that would close a gap. Optional: a gap may need a decision, not a file. */
  proposals: z.array(proposalUnion(MISSING_PROPOSAL_KINDS)).default([]),
})

export const EVALUATION_DIMENSIONS = [
  'skills',
  'agents',
  'workflows',
  'ironLaws',
  'consistency',
  'portability',
  'coverage',
  'verification',
  'safety',
  'complexity',
] as const

export const aiEvaluationFindingSchema = z.object({
  ref: aiRefSchema.optional(),
  problem: z.string().min(1),
  suggestion: z.string().optional(),
  severity: z.enum(SEVERITIES).default('medium'),
})

export const evaluateOutputSchema = z.object({
  dimensions: z
    .array(
      z.object({
        dimension: z.enum(EVALUATION_DIMENSIONS),
        verdict: z.string().min(1),
        findings: z.array(aiEvaluationFindingSchema).default([]),
      }),
    )
    .default([]),
})

export type AIEvaluationReport = z.infer<typeof evaluateOutputSchema>

/** Kinds the compound loop turns experience into. */
export const COMPOUND_PROPOSAL_KINDS = [
  'skill',
  'iron-law',
  'rule',
  'reference',
  'memory',
  'workflow',
] as const

export const compoundOutputSchema = z.object({
  summary: z.string().min(1),
  proposals: z.array(proposalUnion(COMPOUND_PROPOSAL_KINDS)).default([]),
})

export const REQUIREMENT_VERDICT_STATUSES = ['pass', 'fail', 'unclear'] as const

export const requirementVerdictSchema = z.object({
  /** The check's id, exactly as it was given. */
  id: z.string(),
  status: z.enum(REQUIREMENT_VERDICT_STATUSES),
  /** One sentence, naming the artifact that decided it where one did. */
  rationale: z.string().min(1),
})

export type RequirementVerdict = z.infer<typeof requirementVerdictSchema>

export const judgeRequirementsOutputSchema = z.object({
  verdicts: z.array(requirementVerdictSchema).default([]),
})

/**
 * The answer to "clear this finding".
 *
 * The kinds are the caller's, not a constant: a finding about a missing description may only
 * touch that artifact, and one about the Blueprint having no Iron Laws may only write laws.
 * Narrowing the union per finding is what keeps the schema small on the endpoints that read
 * it in the prompt, and it is also the cheapest way to stop a model fixing something else.
 */
export function fixFindingOutputSchema<K extends EntityKind>(kinds: readonly K[]) {
  return z.object({
    artifacts: z.array(proposalUnion(kinds)).default([]),
    /** What was changed and why it clears the finding. Shown above the diff. */
    note: z.string().optional(),
  })
}

export const FIX_DECISIONS = ['change', 'create', 'delete', 'keep'] as const

/** What the model decided about one finding, and why. Shown with the review, one line each. */
export const fixDecisionSchema = z.object({
  code: z.string().min(1),
  ref: aiRefSchema.optional(),
  action: z.enum(FIX_DECISIONS),
  reason: z.string().min(1),
})

export type FixDecision = z.infer<typeof fixDecisionSchema>

/**
 * The answer to "put the whole Blueprint right" (P9-40).
 *
 * The single-finding answer plus two things it has no room for: a decision per finding, so the
 * reasoning reaches the reviewer and not only the diff, and deletions, which the single fix
 * never proposes because a finding about one artifact is never cleared by removing another. The
 * kind of a deletion is a string rather than the narrowed enum: an unknown kind is refused with a
 * note, where an enum would fail the whole answer for one bad line.
 */
export function fixBlueprintOutputSchema<K extends EntityKind>(kinds: readonly K[]) {
  return z.object({
    decisions: z.array(fixDecisionSchema).default([]),
    artifacts: z.array(proposalUnion(kinds)).default([]),
    deletions: z
      .array(
        z.object({ kind: z.string().min(1), id: z.string().min(1), reason: z.string().min(1) }),
      )
      .default([]),
    /** What the Blueprint looks like after this, in a sentence or two. */
    note: z.string().optional(),
  })
}

/**
 * A coherent set of artifacts added to a Blueprint that already exists (P9-15).
 *
 * The same per-collection shape `generateBlueprint` uses rather than a tagged union: an
 * eleven-way discriminated union is a large schema on the endpoints that read it in the
 * prompt, and this shape is the one already proven against real models. What is missing is
 * the header — a capability added to a project does not rename it or move its primary agent.
 */
export const addCapabilityOutputSchema = z.object({
  /** What was added, in a line. Becomes the ChangeSet summary the review is headed with. */
  summary: z.string().min(1),
  agents: z.array(tolerant(AI_ENTITY_SCHEMAS.agent)).default([]),
  skills: z.array(tolerant(AI_ENTITY_SCHEMAS.skill)).default([]),
  workflows: z.array(tolerant(AI_ENTITY_SCHEMAS.workflow)).default([]),
  ironLaws: z.array(tolerant(AI_ENTITY_SCHEMAS['iron-law'])).default([]),
  rules: z.array(tolerant(AI_ENTITY_SCHEMAS.rule)).default([]),
  hooks: z.array(tolerant(AI_ENTITY_SCHEMAS.hook)).default([]),
  gates: z.array(tolerant(AI_ENTITY_SCHEMAS.gate)).default([]),
  tools: z.array(tolerant(AI_ENTITY_SCHEMAS.tool)).default([]),
  references: z.array(tolerant(AI_ENTITY_SCHEMAS.reference)).default([]),
  memories: z.array(tolerant(AI_ENTITY_SCHEMAS.memory)).default([]),
  requirements: z.array(tolerant(AI_ENTITY_SCHEMAS.requirement)).default([]),
})
