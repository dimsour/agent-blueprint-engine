import type { ChangeSet, EntityKind } from '@agent-blueprint/core'

/** Parameters the user supplies when starting an artifact from a template. */
export interface TemplateParams {
  /** Slug for the new entity; becomes its file name and cross-reference key. */
  id: string
  /** Display name. */
  name: string
}

/**
 * A template produces a reviewable {@link ChangeSet}, never a mutation. The UI shows the
 * change-set as a diff exactly like an AI proposal, so "start from template" and "generate
 * with AI" share one review surface.
 */
export interface ArtifactTemplate {
  /** Unique kebab-case id of the template itself (not of the entity it creates). */
  id: string
  kind: EntityKind
  label: string
  description: string
  build(params: TemplateParams): ChangeSet
}

/**
 * A complete starter project: the same file map `readProject` consumes, in canonical form
 * (`renderProjectFiles` of the loaded blueprint returns exactly these bytes).
 */
export interface StarterBlueprint {
  id: string
  label: string
  description: string
  files: Record<string, string>
}
