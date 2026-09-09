/**
 * The wizard's draft Blueprint.
 *
 * Every step is a pure function from one Blueprint to the next, so the ten screens hold no
 * state of their own and the whole flow can be exercised without rendering anything. The
 * draft is a real Blueprint from the first keystroke: it goes through the same schemas and
 * the same `upsertEntity` the workspace uses, which is why nothing the wizard produces can
 * be something the editor would then refuse.
 *
 * Artifacts added here are linked to the primary agent, because an agent that cannot reach
 * its own skills is the most common way a first Blueprint disappoints.
 */
import {
  type Agent,
  type AgentInput,
  applyChangeSet,
  type Blueprint,
  createEmptyBlueprint,
  createEntity,
  type EntityKind,
  type EntityRef,
  deleteEntity,
  getCollection,
  type HarnessId,
  HARNESS_IDS,
  slugify,
  uniqueSlug,
  upsertEntity,
} from '@agent-blueprint/core'
import { templateById } from '@agent-blueprint/templates/artifacts'

export const WIZARD_STEP_IDS = [
  'about',
  'agent',
  'skills',
  'workflows',
  'laws',
  'tools',
  'memory',
  'targets',
  'evaluate',
  'finish',
] as const

export type WizardStepId = (typeof WIZARD_STEP_IDS)[number]

export interface WizardStep {
  id: WizardStepId
  /** Short label for the stepper. */
  label: string
  /** The question the step asks, per docs/07. */
  prompt: string
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 'about', label: 'Project', prompt: 'What are you building?' },
  { id: 'agent', label: 'Agent', prompt: 'Who is the agent?' },
  { id: 'skills', label: 'Skills', prompt: 'What should it know?' },
  { id: 'workflows', label: 'Workflows', prompt: 'How should it work?' },
  { id: 'laws', label: 'Iron Laws', prompt: 'What must never happen?' },
  { id: 'tools', label: 'Tools', prompt: 'What tools can it use?' },
  { id: 'memory', label: 'Memory', prompt: 'How should it remember?' },
  { id: 'targets', label: 'Targets', prompt: 'Where should it run?' },
  { id: 'evaluate', label: 'Evaluate', prompt: 'Is it any good?' },
  { id: 'finish', label: 'Finish', prompt: 'Ready to create' },
]

/** The agent field that links a kind to the primary agent, where one exists. */
const LINK_FIELD: Partial<Record<EntityKind, keyof Agent>> = {
  skill: 'skillIds',
  workflow: 'workflowIds',
  'iron-law': 'ironLawIds',
  rule: 'ruleIds',
  tool: 'toolIds',
  reference: 'referenceIds',
  memory: 'memoryIds',
}

export const DRAFT_PLACEHOLDER_NAME = 'Untitled Blueprint'

/** The two harnesses with a complete adapter; the others are one checkbox away. */
export const DEFAULT_TARGETS: readonly HarnessId[] = ['claude-code', 'codex']

export function emptyDraft(): Blueprint {
  return setTargets(
    createEmptyBlueprint({ id: 'untitled-blueprint', name: DRAFT_PLACEHOLDER_NAME }),
    DEFAULT_TARGETS,
  )
}

export function primaryAgent(draft: Blueprint): Agent | undefined {
  const id = draft.settings.primaryAgentId
  return id ? draft.agents.find((agent) => agent.id === id) : draft.agents[0]
}

/** Step 1. The id follows the name until the author types one, and never becomes empty. */
export function setIdentity(
  draft: Blueprint,
  patch: { name?: string; id?: string; description?: string },
): Blueprint {
  const name = patch.name ?? draft.name
  return {
    ...draft,
    name: name.trim() === '' ? DRAFT_PLACEHOLDER_NAME : name,
    id: patch.id ?? (slugify(name) || 'untitled-blueprint'),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
  }
}

/**
 * Step 2. The wizard builds one agent and makes it primary; more agents are added later in
 * the workspace. Creating it on the first edit rather than up front keeps an abandoned
 * wizard from leaving an empty agent behind.
 */
export function setAgent(draft: Blueprint, patch: Partial<AgentInput>): Blueprint {
  const existing = primaryAgent(draft)
  const base =
    existing ?? createEntity(draft, 'agent', { name: patch.name?.trim() || `${draft.name} agent` })

  const merged = {
    ...(base as unknown as Record<string, unknown>),
    ...patch,
    id: base.id,
  } as AgentInput

  const next = upsertEntity(draft, 'agent', merged)
  return { ...next, settings: { ...next.settings, primaryAgentId: base.id } }
}

/** Adds `id` to the agent field that links this kind, if there is one and an agent exists. */
function link(draft: Blueprint, kind: EntityKind, id: string): Blueprint {
  const field = LINK_FIELD[kind]
  const agent = primaryAgent(draft)
  if (!field || !agent) return draft

  const current = agent[field] as string[]
  if (current.includes(id)) return draft
  return upsertEntity(draft, 'agent', {
    ...(agent as unknown as Record<string, unknown>),
    [field]: [...current, id],
  } as AgentInput)
}

export interface AddedArtifact {
  draft: Blueprint
  ref: EntityRef
}

/** Steps 3 to 7: an artifact from a template, applied as a ChangeSet and linked. */
export function addFromTemplate(draft: Blueprint, templateId: string): AddedArtifact | undefined {
  const template = templateById(templateId)
  if (!template) return undefined

  const taken = getCollection(draft, template.kind).map((entity) => entity.id)
  const id = uniqueSlug(template.label, taken)
  const changeSet = template.build({ id, name: template.label })
  const applied = applyChangeSet(draft, changeSet)

  return { draft: link(applied.blueprint, template.kind, id), ref: { kind: template.kind, id } }
}

/** Steps 3 to 7: a blank artifact of a kind, for anything the templates do not cover. */
export function addBlank(draft: Blueprint, kind: EntityKind, name: string): AddedArtifact {
  const entity = createEntity(draft, kind, { name })
  const next = upsertEntity(draft, kind, entity as never)
  return { draft: link(next, kind, entity.id), ref: { kind, id: entity.id } }
}

/** Removing an artifact removes the agent's reference to it too. */
export function removeArtifact(draft: Blueprint, ref: EntityRef): Blueprint {
  return deleteEntity(draft, ref).blueprint
}

/**
 * Step 8. Only chosen harnesses become targets at all, rather than a row per harness with a
 * flag: an unchosen target is absent from `blueprint.yaml`, which is how the starters read.
 * Options already set for a harness survive being unchecked and rechecked in one sitting.
 */
export function setTargets(draft: Blueprint, enabled: readonly HarnessId[]): Blueprint {
  const wanted = HARNESS_IDS.filter((id) => enabled.includes(id))
  return {
    ...draft,
    targets: wanted.map(
      (harnessId) =>
        draft.targets.find((target) => target.harnessId === harnessId) ?? {
          harnessId,
          enabled: true,
          options: {},
        },
    ),
  }
}

export function enabledTargetIds(draft: Blueprint): HarnessId[] {
  return draft.targets.filter((target) => target.enabled).map((target) => target.harnessId)
}

/** What a step still needs before it can be called done, or undefined when it is. */
export function blockingReason(draft: Blueprint, step: WizardStepId): string | undefined {
  switch (step) {
    case 'about':
      return draft.name.trim() === '' || draft.name === DRAFT_PLACEHOLDER_NAME
        ? 'Give the Blueprint a name.'
        : undefined
    case 'agent':
      return primaryAgent(draft) === undefined
        ? 'Name the agent this system is built around.'
        : undefined
    default:
      return undefined
  }
}
