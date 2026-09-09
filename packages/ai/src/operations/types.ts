/**
 * What every operation is given and what it hands back.
 *
 * An operation never sees the network and never sees a Blueprint being mutated: it gets a
 * client, a read-only Blueprint and what the user is looking at, and returns a proposal. The
 * `notes` are as much a part of the result as the ChangeSet — they say what the model asked
 * for that could not be honoured, which is the difference between a review the user trusts
 * and one where artifacts quietly went missing.
 */
import type { Blueprint, ChangeSet, Diagnostic, EntityRef } from '@agent-blueprint/core'

import type { AIClient } from '../client/types'
import type { BuiltContext } from '../context/build'
import type { StructuredOptions } from '../structured'
import type { ContextBudget } from '../tokens'

export interface OperationContext {
  blueprint: Blueprint
  /** The artifact the user is looking at, if any. */
  selection?: EntityRef
  /** Free text from the user. */
  instruction?: string
  /** Findings core already computed, so the model is not asked to re-derive them. */
  diagnostics?: readonly Diagnostic[]
}

export interface OperationDeps {
  client: AIClient
  budget?: ContextBudget
  structured?: StructuredOptions
}

/** Common to every operation's result, whatever else it carries. */
export interface OperationMeta {
  /** True when something the answer depended on did not fit the budget. */
  contextTrimmed: boolean
  /** What was dropped, renamed or unwired while assembling the proposal. */
  notes: string[]
}

export interface ChangeSetResult extends OperationMeta {
  changeSet: ChangeSet
}

export interface DiagnosticsResult extends OperationMeta {
  diagnostics: Diagnostic[]
}

export type { BuiltContext }
