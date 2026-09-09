/**
 * The prompt catalogue.
 *
 * One template per operation, versioned by file name. `PROMPTS` names the version each
 * operation currently uses; an older file stays where it is so the fixtures recorded against
 * it keep meaning what they meant.
 */
export * from './compose'
export * from './glossary'
export * from './compound.v1'
export * from './create-iron-laws.v1'
export * from './create-workflow.v1'
export * from './evaluate.v1'
export * from './find-contradictions.v1'
export * from './find-missing.v1'
export * from './generate-artifact.v1'
export * from './generate-blueprint.v1'
export * from './improve-artifact.v1'
export * from './judge-requirements.v1'

import { compoundV1 } from './compound.v1'
import { createIronLawsV1 } from './create-iron-laws.v1'
import { createWorkflowV1 } from './create-workflow.v1'
import { evaluateV1 } from './evaluate.v1'
import { findContradictionsV1 } from './find-contradictions.v1'
import { findMissingV1 } from './find-missing.v1'
import { generateArtifactV1 } from './generate-artifact.v1'
import { generateBlueprintV1 } from './generate-blueprint.v1'
import { improveArtifactV1 } from './improve-artifact.v1'
import { judgeRequirementsV1 } from './judge-requirements.v1'

export const PROMPTS = {
  'generate-blueprint': generateBlueprintV1,
  'generate-artifact': generateArtifactV1,
  'improve-artifact': improveArtifactV1,
  'create-workflow': createWorkflowV1,
  'create-iron-laws': createIronLawsV1,
  'find-contradictions': findContradictionsV1,
  'find-missing': findMissingV1,
  evaluate: evaluateV1,
  compound: compoundV1,
  'judge-requirements': judgeRequirementsV1,
} as const

export type PromptId = keyof typeof PROMPTS
