/**
 * @agent-blueprint/core — the canonical Blueprint model and everything that operates on it
 * without a UI: schemas, project format, validation, dependency graph, migrations and
 * change-sets. Framework-free by design (see AGENTS.md).
 */

// Model
export * from './model/ids'
export * from './model/json'
export * from './model/kinds'
export * from './model/options'
export * from './model/options-doc'
export * from './model/refs'
export * from './model/types'

// Schemas (Zod) and constants
export * from './schema/index'

// Blueprint operations
export * from './blueprint/create'
export * from './blueprint/create-entity'
export * from './blueprint/entities'
export * from './blueprint/normalize'
export * from './blueprint/rename'
export * from './blueprint/delete'

// Project format
export * from './project/binary'
export * from './project/virtual-fs'
export * from './project/serialize'
export * from './project/strip-defaults'
export * from './project/layout'
export * from './project/build-manifest'
export * from './project/read'
export * from './project/write'

// Migrations
export * from './migrations/index'

// Change-sets
export * from './changeset/types'
export * from './changeset/apply'
export * from './changeset/diff'

// Validation and dependencies
export * from './validation/types'
export * from './validation/codes'
export * from './validation/context'
export * from './validation/engine'
export * from './validation/rules/structural'
export * from './validation/rules/semantic'
export * from './validation/rules/orphans'
export * from './validation/contradictions'
export * from './validation/requirements'
export * from './validation/text'
export * from './validation/workflow-graph'
export * from './dependencies/graph'

// Evaluation
export * from './evaluation/index'
