/**
 * `build-manifest.json` records which files the compiler produced for each target, with a
 * content hash. It lets a later export delete stale outputs and detect user edits to
 * generated files, and it lets a GitHub push touch only what it owns. No timestamps: the
 * file only changes when generated content changes.
 */
import { z } from 'zod'

import { HARNESS_IDS } from '../model/kinds'

export const BUILD_MANIFEST_SCHEMA_VERSION = 1 as const

export const buildManifestTargetSchema = z.object({
  adapterVersion: z.string().min(1),
  /** path → `sha256:<hex>` */
  files: z.record(z.string().min(1), z.string().regex(/^sha256:[0-9a-f]{64}$/)),
})

export const buildManifestSchema = z.object({
  schemaVersion: z.literal(BUILD_MANIFEST_SCHEMA_VERSION),
  /** Files generated at the repository root that are shared by several targets (e.g. AGENTS.md). */
  shared: buildManifestTargetSchema.optional(),
  targets: z.partialRecord(z.enum(HARNESS_IDS), buildManifestTargetSchema).default({}),
})

export type BuildManifest = z.output<typeof buildManifestSchema>
export type BuildManifestTarget = z.output<typeof buildManifestTargetSchema>

export function createEmptyBuildManifest(): BuildManifest {
  return { schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION, targets: {} }
}

/** Every path the manifest claims ownership of. */
export function ownedPaths(manifest: BuildManifest): string[] {
  const paths = new Set<string>()
  for (const path of Object.keys(manifest.shared?.files ?? {})) paths.add(path)
  for (const target of Object.values(manifest.targets)) {
    for (const path of Object.keys(target?.files ?? {})) paths.add(path)
  }
  return Array.from(paths).sort()
}
