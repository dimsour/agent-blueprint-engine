/**
 * Artifact templates: the entry point a browser can import.
 *
 * The starter blueprints are read from disk with `node:fs`, so they live behind the package
 * root instead. Everything here is pure data and pure functions, which is what lets the IDE
 * offer "new from template" without a round trip to the server.
 */
import type { EntityKind } from '@agent-blueprint/core'

import { agentTemplates } from './agents'
import { gateTemplates, hookTemplates } from './automation'
import { ironLawTemplates, ruleTemplates } from './governance'
import { skillTemplates } from './skills'
import { workflowTemplates } from './workflows'
import type { ArtifactTemplate } from '../types'

export type { ArtifactTemplate, TemplateParams } from '../types'
export { body, chain, defineTemplate, fanOut, type Graph, type StepSpec } from './define'
export { agentTemplates } from './agents'
export { skillTemplates } from './skills'
export { workflowTemplates } from './workflows'
export { ironLawTemplates, ruleTemplates } from './governance'
export { gateTemplates, hookTemplates } from './automation'

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
