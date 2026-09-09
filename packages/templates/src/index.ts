/**
 * @agent-blueprint/templates — the artifacts a user starts from.
 *
 * A template never mutates a Blueprint: it returns a ChangeSet, so "start from template" and
 * "generate with AI" land in the same review surface and the user always sees what is about
 * to be added.
 *
 * Artifact templates are implemented for every kind a user starts from. The ten starter
 * blueprints are roadmap P1-08.
 */
export * from './types'
export { body, chain, defineTemplate, fanOut, type Graph, type StepSpec } from './artifacts/define'
export { agentTemplates } from './artifacts/agents'
export { skillTemplates } from './artifacts/skills'
export { workflowTemplates } from './artifacts/workflows'
export { ironLawTemplates, ruleTemplates } from './artifacts/governance'
export { gateTemplates, hookTemplates } from './artifacts/automation'
export { readStarterFiles, starterBlueprints, starterById, starterIds } from './blueprints/index'

import type { EntityKind } from '@agent-blueprint/core'

import { agentTemplates } from './artifacts/agents'
import { gateTemplates, hookTemplates } from './artifacts/automation'
import { ironLawTemplates, ruleTemplates } from './artifacts/governance'
import { skillTemplates } from './artifacts/skills'
import { workflowTemplates } from './artifacts/workflows'
import type { ArtifactTemplate } from './types'

/** Every artifact template, grouped by kind in the order the UI lists them. */
export const artifactTemplates: ArtifactTemplate[] = [
  ...agentTemplates,
  ...skillTemplates,
  ...workflowTemplates,
  ...ironLawTemplates,
  ...ruleTemplates,
  ...hookTemplates,
  ...gateTemplates,
]

export function templatesForKind(kind: EntityKind): ArtifactTemplate[] {
  return artifactTemplates.filter((template) => template.kind === kind)
}

export function templateById(id: string): ArtifactTemplate | undefined {
  return artifactTemplates.find((template) => template.id === id)
}
