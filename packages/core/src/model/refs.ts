/**
 * Every place one entity refers to another, in one table.
 *
 * `visitRefs` walks all reference sites and lets the visitor replace or remove the id in
 * place. It is the single mechanism behind rename refactors, delete clean-up, dangling
 * reference detection and the dependency graph, so adding a new reference-bearing field to
 * a schema means adding it here (the reference tests will catch omissions in the fixture).
 */
import type { EntityKind } from './kinds'
import type { Blueprint, EntityRef, RequirementCheck } from './types'

export type RefRelation =
  | 'uses-skill'
  | 'runs-workflow'
  | 'bound-by-law'
  | 'follows-rule'
  | 'uses-tool'
  | 'reads-reference'
  | 'has-memory'
  | 'delegates-to'
  | 'activates-in-workflow'
  | 'allowed-tool'
  | 'node-agent'
  | 'node-skill'
  | 'node-tool'
  | 'node-gate'
  | 'triggered-by-agent'
  | 'scoped-to-agent'
  | 'scoped-to-workflow'
  | 'tests-agent'
  | 'checks-workflow'
  | 'checks-agent'
  | 'primary-agent'

/** The owner of a reference: an entity, or the Blueprint itself (e.g. `settings.primaryAgentId`). */
export type RefSource = EntityRef | { readonly kind: 'blueprint'; readonly id: string }

export interface RefSite {
  readonly from: RefSource
  readonly relation: RefRelation
  readonly toKind: EntityKind
  readonly id: string
  /** Replace the referenced id, or remove the reference entirely with `null`. */
  replace(newId: string | null): void
}

export interface EntityReference {
  readonly from: RefSource
  readonly to: EntityRef
  readonly relation: RefRelation
}

export type RefVisitor = (site: RefSite) => void

function visitList(
  from: RefSource,
  relation: RefRelation,
  toKind: EntityKind,
  list: string[] | undefined,
  visit: RefVisitor,
): void {
  if (!list) return
  const removed = new Set<number>()
  list.forEach((id, index) => {
    visit({
      from,
      relation,
      toKind,
      id,
      replace(newId) {
        if (newId === null) removed.add(index)
        else list[index] = newId
      },
    })
  })
  if (removed.size > 0) {
    for (let i = list.length - 1; i >= 0; i -= 1) if (removed.has(i)) list.splice(i, 1)
  }
}

function visitScalar(
  from: RefSource,
  relation: RefRelation,
  toKind: EntityKind,
  holder: object,
  key: string,
  visit: RefVisitor,
): void {
  const record = holder as Record<string, unknown>
  const id = record[key]
  if (typeof id !== 'string') return
  visit({
    from,
    relation,
    toKind,
    id,
    replace(newId) {
      if (newId === null) delete record[key]
      else record[key] = newId
    },
  })
}

function visitCheck(from: RefSource, check: RequirementCheck, visit: RefVisitor): void {
  switch (check.type) {
    case 'workflow-has-node-type':
      visitScalar(from, 'checks-workflow', 'workflow', check, 'workflowId', visit)
      break
    case 'agent-has-skill-tag':
      visitScalar(from, 'checks-agent', 'agent', check, 'agentId', visit)
      break
    case 'iron-law-matches':
    case 'hook-exists':
    case 'gate-exists':
    case 'text-mentions':
    case 'ai-judged':
      break
  }
}

export function visitRefs(bp: Blueprint, visit: RefVisitor): void {
  const blueprintSource: RefSource = { kind: 'blueprint', id: bp.id }
  visitScalar(blueprintSource, 'primary-agent', 'agent', bp.settings, 'primaryAgentId', visit)

  for (const agent of bp.agents) {
    const from: EntityRef = { kind: 'agent', id: agent.id }
    visitList(from, 'uses-skill', 'skill', agent.skillIds, visit)
    visitList(from, 'runs-workflow', 'workflow', agent.workflowIds, visit)
    visitList(from, 'bound-by-law', 'iron-law', agent.ironLawIds, visit)
    visitList(from, 'follows-rule', 'rule', agent.ruleIds, visit)
    visitList(from, 'uses-tool', 'tool', agent.toolIds, visit)
    visitList(from, 'reads-reference', 'reference', agent.referenceIds, visit)
    visitList(from, 'has-memory', 'memory', agent.memoryIds, visit)
    visitList(from, 'delegates-to', 'agent', agent.delegation?.canDelegateTo, visit)
  }

  for (const skill of bp.skills) {
    const from: EntityRef = { kind: 'skill', id: skill.id }
    visitList(from, 'reads-reference', 'reference', skill.referenceIds, visit)
    visitList(from, 'allowed-tool', 'tool', skill.allowedToolIds, visit)
    visitList(from, 'activates-in-workflow', 'workflow', skill.activation.workflowIds, visit)
  }

  for (const workflow of bp.workflows) {
    const from: EntityRef = { kind: 'workflow', id: workflow.id }
    for (const node of workflow.nodes) {
      visitScalar(from, 'node-agent', 'agent', node.config, 'agentId', visit)
      visitScalar(from, 'node-skill', 'skill', node.config, 'skillId', visit)
      visitScalar(from, 'node-tool', 'tool', node.config, 'toolId', visit)
      visitScalar(from, 'node-gate', 'gate', node.config, 'gateId', visit)
    }
    visitList(from, 'triggered-by-agent', 'agent', workflow.triggers.agentIds, visit)
  }

  for (const law of bp.ironLaws) {
    const from: EntityRef = { kind: 'iron-law', id: law.id }
    visitList(from, 'scoped-to-agent', 'agent', law.scope.agentIds, visit)
    visitList(from, 'scoped-to-workflow', 'workflow', law.scope.workflowIds, visit)
  }

  for (const rule of bp.rules) {
    const from: EntityRef = { kind: 'rule', id: rule.id }
    visitList(from, 'scoped-to-agent', 'agent', rule.scope.agentIds, visit)
    visitList(from, 'scoped-to-workflow', 'workflow', rule.scope.workflowIds, visit)
  }

  for (const requirement of bp.requirements) {
    const from: EntityRef = { kind: 'requirement', id: requirement.id }
    for (const check of requirement.checks) visitCheck(from, check, visit)
  }

  for (const scenario of bp.scenarios) {
    const from: EntityRef = { kind: 'scenario', id: scenario.id }
    visitScalar(from, 'tests-agent', 'agent', scenario, 'agentId', visit)
    for (const behavior of scenario.expectedBehaviors) {
      if (behavior.check) visitCheck(from, behavior.check, visit)
    }
  }
}

/** All references in the Blueprint, without mutating anything. */
export function collectRefs(bp: Blueprint): EntityReference[] {
  const refs: EntityReference[] = []
  visitRefs(bp, (site) => {
    refs.push({ from: site.from, to: { kind: site.toKind, id: site.id }, relation: site.relation })
  })
  return refs
}

export function isEntitySource(source: RefSource): source is EntityRef {
  return source.kind !== 'blueprint'
}
