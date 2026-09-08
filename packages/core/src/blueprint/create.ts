import type { Blueprint } from '../model/types'
import { BLUEPRINT_SCHEMA_VERSION, blueprintSchema } from '../schema/index'

export interface CreateBlueprintOptions {
  id: string
  name: string
  description?: string
  version?: string
}

/** A valid, empty Blueprint with defaults applied. */
export function createEmptyBlueprint(options: CreateBlueprintOptions): Blueprint {
  return blueprintSchema.parse({
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    id: options.id,
    name: options.name,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.version !== undefined ? { version: options.version } : {}),
  })
}
