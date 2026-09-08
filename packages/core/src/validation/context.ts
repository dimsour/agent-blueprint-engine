import { buildEntityIndex, type EntityIndex } from '../blueprint/entities'
import { buildDependencyGraph, type DependencyGraph } from '../dependencies/graph'
import type { Blueprint } from '../model/types'

/** Shared, lazily computed inputs for validation rules so each rule stays a pure function. */
export interface ValidationContext {
  readonly blueprint: Blueprint
  readonly index: EntityIndex
  readonly graph: DependencyGraph
}

export function createValidationContext(blueprint: Blueprint): ValidationContext {
  let index: EntityIndex | undefined
  let graph: DependencyGraph | undefined
  return {
    blueprint,
    get index() {
      index ??= buildEntityIndex(blueprint)
      return index
    },
    get graph() {
      graph ??= buildDependencyGraph(blueprint)
      return graph
    },
  }
}
