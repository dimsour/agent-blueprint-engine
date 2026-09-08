import type { Blueprint } from '../model/types'
import { createValidationContext, type ValidationContext } from './context'
import { STRUCTURAL_RULES } from './rules/structural'
import { type Diagnostic, sortDiagnostics } from './types'

export interface ValidationRule {
  /** Stable code such as `BP-WF-001`. One rule may emit several diagnostics with this code. */
  readonly code: string
  readonly description: string
  check(ctx: ValidationContext): Diagnostic[]
}

/** All built-in rules. Semantic and requirement rules join this list in roadmap phase P1. */
export const ALL_RULES: readonly ValidationRule[] = [...STRUCTURAL_RULES]

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
