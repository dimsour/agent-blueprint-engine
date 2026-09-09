/**
 * @agent-blueprint/templates — the artifacts a user starts from.
 *
 * A template never mutates a Blueprint: it returns a ChangeSet, so "start from template" and
 * "generate with AI" land in the same review surface and the user always sees what is about
 * to be added.
 *
 * Skill and agent templates are implemented. Workflow, Iron Law, rule, hook and gate
 * templates, and the ten starter blueprints, are roadmap P1-07 and P1-08.
 */
export * from './types'
export { body, chain, defineTemplate, type Graph, type StepSpec } from './artifacts/define'
export { agentTemplates } from './artifacts/agents'
export { skillTemplates } from './artifacts/skills'

import type { EntityKind } from '@agent-blueprint/core'

import { agentTemplates } from './artifacts/agents'
import { skillTemplates } from './artifacts/skills'
import type { ArtifactTemplate } from './types'

/** Every artifact template, in the order the UI lists them. */
export const artifactTemplates: ArtifactTemplate[] = [...agentTemplates, ...skillTemplates]

export function templatesForKind(kind: EntityKind): ArtifactTemplate[] {
  return artifactTemplates.filter((template) => template.kind === kind)
}

export function templateById(id: string): ArtifactTemplate | undefined {
  return artifactTemplates.find((template) => template.id === id)
}
