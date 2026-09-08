/**
 * Domain types, inferred from the Zod schemas so there is exactly one definition of every
 * shape. `X` is the normalized (parsed) form with defaults applied; `XInput` is what
 * callers may pass in (defaults optional).
 */
import type { z } from 'zod'

import type {
  agentSchema,
  blueprintHeaderSchema,
  blueprintSchema,
  blueprintSettingsSchema,
  expectedBehaviorSchema,
  gateCriterionSchema,
  gateSchema,
  hookActionSchema,
  hookConditionsSchema,
  hookSchema,
  ironLawSchema,
  manifestSchema,
  mcpServerSchema,
  memoryDefinitionSchema,
  modelPreferenceSchema,
  permissionPatternSchema,
  permissionSetSchema,
  referenceSchema,
  requirementCheckSchema,
  requirementSchema,
  ruleSchema,
  scenarioSchema,
  scopeSchema,
  skillActivationSchema,
  skillResourceSchema,
  skillSchema,
  targetConfigSchema,
  toolSchema,
  workflowEdgeSchema,
  workflowNodeConfigSchema,
  workflowNodeSchema,
  workflowSchema,
  workflowTriggersSchema,
} from '../schema/index'
import type { EntityKind } from './kinds'

export type Blueprint = z.output<typeof blueprintSchema>
export type BlueprintInput = z.input<typeof blueprintSchema>
export type BlueprintHeader = z.output<typeof blueprintHeaderSchema>
export type BlueprintSettings = z.output<typeof blueprintSettingsSchema>
export type Manifest = z.output<typeof manifestSchema>
export type ManifestInput = z.input<typeof manifestSchema>
export type TargetConfig = z.output<typeof targetConfigSchema>

export type Agent = z.output<typeof agentSchema>
export type AgentInput = z.input<typeof agentSchema>
export type PermissionSet = z.output<typeof permissionSetSchema>
export type PermissionPattern = z.output<typeof permissionPatternSchema>
export type ModelPreference = z.output<typeof modelPreferenceSchema>

export type Skill = z.output<typeof skillSchema>
export type SkillInput = z.input<typeof skillSchema>
export type SkillActivation = z.output<typeof skillActivationSchema>
export type SkillResource = z.output<typeof skillResourceSchema>

export type Workflow = z.output<typeof workflowSchema>
export type WorkflowInput = z.input<typeof workflowSchema>
export type WorkflowNode = z.output<typeof workflowNodeSchema>
export type WorkflowNodeConfig = z.output<typeof workflowNodeConfigSchema>
export type WorkflowEdge = z.output<typeof workflowEdgeSchema>
export type WorkflowTriggers = z.output<typeof workflowTriggersSchema>

export type IronLaw = z.output<typeof ironLawSchema>
export type IronLawInput = z.input<typeof ironLawSchema>
export type Rule = z.output<typeof ruleSchema>
export type RuleInput = z.input<typeof ruleSchema>
export type Scope = z.output<typeof scopeSchema>
export type Hook = z.output<typeof hookSchema>
export type HookInput = z.input<typeof hookSchema>
export type HookConditions = z.output<typeof hookConditionsSchema>
export type HookAction = z.output<typeof hookActionSchema>
export type Gate = z.output<typeof gateSchema>
export type GateInput = z.input<typeof gateSchema>
export type GateCriterion = z.output<typeof gateCriterionSchema>

export type Tool = z.output<typeof toolSchema>
export type ToolInput = z.input<typeof toolSchema>
export type McpServer = z.output<typeof mcpServerSchema>
export type Reference = z.output<typeof referenceSchema>
export type ReferenceInput = z.input<typeof referenceSchema>
export type MemoryDefinition = z.output<typeof memoryDefinitionSchema>
export type MemoryDefinitionInput = z.input<typeof memoryDefinitionSchema>

export type Requirement = z.output<typeof requirementSchema>
export type RequirementInput = z.input<typeof requirementSchema>
export type RequirementCheck = z.output<typeof requirementCheckSchema>
export type Scenario = z.output<typeof scenarioSchema>
export type ScenarioInput = z.input<typeof scenarioSchema>
export type ExpectedBehavior = z.output<typeof expectedBehaviorSchema>

/** Map from entity kind to its normalized entity type. */
export interface EntityTypeMap {
  agent: Agent
  skill: Skill
  workflow: Workflow
  'iron-law': IronLaw
  rule: Rule
  hook: Hook
  gate: Gate
  tool: Tool
  reference: Reference
  memory: MemoryDefinition
  requirement: Requirement
  scenario: Scenario
}

/** Map from entity kind to its input (pre-normalization) type. */
export interface EntityInputTypeMap {
  agent: AgentInput
  skill: SkillInput
  workflow: WorkflowInput
  'iron-law': IronLawInput
  rule: RuleInput
  hook: HookInput
  gate: GateInput
  tool: ToolInput
  reference: ReferenceInput
  memory: MemoryDefinitionInput
  requirement: RequirementInput
  scenario: ScenarioInput
}

export type EntityOf<K extends EntityKind> = EntityTypeMap[K]
export type AnyEntity = EntityTypeMap[EntityKind]

/** A pointer to one entity in a Blueprint. */
export interface EntityRef<K extends EntityKind = EntityKind> {
  readonly kind: K
  readonly id: string
}

export function entityRef<K extends EntityKind>(kind: K, id: string): EntityRef<K> {
  return { kind, id }
}

export function sameRef(a: EntityRef, b: EntityRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

export function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`
}
