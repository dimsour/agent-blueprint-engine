/**
 * How the inspector talks about the dependency graph.
 *
 * The graph carries relation names for the model's benefit (`uses-skill`, `node-gate`); a
 * person reading the panel wants a phrase instead, and a different phrase depending on which
 * end of the edge they are standing on. "This agent uses a skill" and "this skill is used by
 * an agent" are the same edge read from opposite sides.
 */
import {
  buildDependencyGraph,
  type Blueprint,
  type DependencyEdge,
  type EntityRef,
  findEntity,
  type RefRelation,
} from '@agent-blueprint/core'

/** Outgoing phrase (what this artifact does to the other) and incoming phrase. */
const RELATION_PHRASES: Record<RefRelation, { out: string; in: string }> = {
  'uses-skill': { out: 'Uses', in: 'Used by' },
  'runs-workflow': { out: 'Runs', in: 'Run by' },
  'bound-by-law': { out: 'Bound by', in: 'Binds' },
  'follows-rule': { out: 'Follows', in: 'Followed by' },
  'uses-tool': { out: 'Uses tool', in: 'Tool of' },
  'reads-reference': { out: 'Reads', in: 'Read by' },
  'has-memory': { out: 'Remembers with', in: 'Memory of' },
  'delegates-to': { out: 'Delegates to', in: 'Delegated to by' },
  'activates-in-workflow': { out: 'Activates in', in: 'Activates' },
  'allowed-tool': { out: 'May use', in: 'Allowed for' },
  'node-agent': { out: 'Step runs', in: 'Runs a step of' },
  'node-skill': { out: 'Step uses', in: 'Used by a step of' },
  'node-tool': { out: 'Step uses tool', in: 'Tool of a step of' },
  'node-gate': { out: 'Checked by', in: 'Checks' },
  'triggered-by-agent': { out: 'Triggered by', in: 'Triggers' },
  'scoped-to-agent': { out: 'Applies to', in: 'Governed by' },
  'scoped-to-workflow': { out: 'Applies to', in: 'Governed by' },
  'tests-agent': { out: 'Tests', in: 'Tested by' },
  'checks-workflow': { out: 'Checks', in: 'Checked by' },
  'checks-agent': { out: 'Checks', in: 'Checked by' },
  'primary-agent': { out: 'Primary agent', in: 'Primary agent of the Blueprint' },
}

export function relationPhrase(relation: RefRelation, direction: 'out' | 'in'): string {
  return RELATION_PHRASES[relation][direction]
}

export interface RelatedArtifact {
  readonly ref: EntityRef
  /** Display name of the artifact, or its id when it no longer exists. */
  readonly name: string
  readonly phrase: string
  /** True when the reference points at an artifact that is not in the Blueprint. */
  readonly missing: boolean
}

export interface ArtifactRelations {
  /** Artifacts this one points at. */
  readonly dependencies: readonly RelatedArtifact[]
  /** Artifacts that point at this one; the answer to "what breaks if I delete it". */
  readonly dependents: readonly RelatedArtifact[]
  readonly isPrimaryAgent: boolean
}

function nameOf(blueprint: Blueprint, ref: EntityRef): string | undefined {
  return findEntity(blueprint, ref.kind, ref.id)?.name
}

/**
 * Collapses the edge list into two lists of artifacts. Two artifacts can be joined by more
 * than one edge (an agent that both uses a skill and allows its tool); the first phrase wins
 * so the panel stays one line per artifact.
 */
function collapse(
  blueprint: Blueprint,
  edges: readonly DependencyEdge[],
  direction: 'out' | 'in',
): RelatedArtifact[] {
  const seen = new Set<string>()
  const out: RelatedArtifact[] = []
  for (const edge of edges) {
    const ref = direction === 'out' ? edge.to : edge.from
    const key = `${ref.kind}:${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = nameOf(blueprint, ref)
    out.push({
      ref,
      name: name ?? ref.id,
      phrase: relationPhrase(edge.relation, direction),
      missing: name === undefined,
    })
  }
  return out
}

/** Everything the inspector needs to say about one artifact's place in the Blueprint. */
export function relationsOf(blueprint: Blueprint, ref: EntityRef): ArtifactRelations {
  const graph = buildDependencyGraph(blueprint)
  return {
    dependencies: collapse(blueprint, graph.dependenciesOf(ref), 'out'),
    dependents: collapse(blueprint, graph.dependentsOf(ref), 'in'),
    isPrimaryAgent: ref.kind === 'agent' && graph.primaryAgentId === ref.id,
  }
}
