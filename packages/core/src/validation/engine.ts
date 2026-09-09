import type { Blueprint } from '../model/types'
import { createValidationContext, type ValidationContext } from './context'
import { findContradictions } from './contradictions'
import { requirementRule } from './requirements'
import { ORPHAN_RULES } from './rules/orphans'
import { SEMANTIC_RULES } from './rules/semantic'
import { STRUCTURAL_RULES } from './rules/structural'
import { type Diagnostic, sortDiagnostics } from './types'

export interface ValidationRule {
  /** Stable code such as `BP-WF-001`. One rule may emit several diagnostics with this code. */
  readonly code: string
  readonly description: string
  check(ctx: ValidationContext): Diagnostic[]
}

export const contradictionRule: ValidationRule = {
  code: 'BP-CONTRA-001',
  description: 'Two artifacts must not tell the agent opposite things about the same subject.',
  check: ({ blueprint }) => findContradictions(blueprint),
}

/**
 * Every built-in rule. Order does not matter: diagnostics are sorted by severity, code and
 * artifact before they are returned.
 */
export const ALL_RULES: readonly ValidationRule[] = [
  ...STRUCTURAL_RULES,
  ...SEMANTIC_RULES,
  ...ORPHAN_RULES,
  contradictionRule,
  requirementRule,
]

export function validateBlueprint(
  blueprint: Blueprint,
  rules: readonly ValidationRule[] = ALL_RULES,
): Diagnostic[] {
  const ctx = createValidationContext(blueprint)
  const diagnostics: Diagnostic[] = []
  for (const rule of rules) diagnostics.push(...rule.check(ctx))
  return sortDiagnostics(diagnostics)
}

export function ruleByCode(
  code: string,
  rules: readonly ValidationRule[] = ALL_RULES,
): ValidationRule | undefined {
  return rules.find((rule) => rule.code === code)
}
