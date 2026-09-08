/**
 * Schema migrations run on *raw* data (before Zod parsing) so that an old project can be
 * loaded by a newer application. Blueprint schema versioning is independent of exporter
 * versions: adapters carry their own `version`, recorded in build-manifest.json.
 *
 * Adding a migration:
 *   1. bump BLUEPRINT_SCHEMA_VERSION in schema/blueprint.ts
 *   2. add `{ from: '<old>', to: '<new>', manifest(raw), entity(kind, raw) }` to MIGRATIONS
 *   3. add a fixture project at the old version and a test that reads it
 */
import type { EntityKind } from '../model/kinds'
import { BLUEPRINT_SCHEMA_VERSION } from '../schema/blueprint'

export type RawRecord = Record<string, unknown>

export interface Migration {
  readonly from: string
  readonly to: string
  readonly description: string
  manifest(raw: RawRecord): RawRecord
  entity(kind: EntityKind, raw: RawRecord): RawRecord
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(readonly version: string) {
    super(
      `Blueprint schema version "${version}" is not supported by this application (current: ${BLUEPRINT_SCHEMA_VERSION}). ` +
        'Update the application, or export the project from a version that understands it.',
    )
    this.name = 'UnsupportedSchemaVersionError'
  }
}

/** Ordered chain; each entry's `from` must equal the previous entry's `to`. */
export const MIGRATIONS: readonly Migration[] = []

export const CURRENT_SCHEMA_VERSION: string = BLUEPRINT_SCHEMA_VERSION

/** Chain of migrations needed to bring `version` to the current version. */
export function migrationPath(
  version: string,
  migrations: readonly Migration[] = MIGRATIONS,
  target: string = CURRENT_SCHEMA_VERSION,
): Migration[] {
  const path: Migration[] = []
  let current = version
  const guard = new Set<string>()
  while (current !== target) {
    if (guard.has(current)) throw new UnsupportedSchemaVersionError(version)
    guard.add(current)
    const next = migrations.find((m) => m.from === current)
    if (!next) throw new UnsupportedSchemaVersionError(version)
    path.push(next)
    current = next.to
  }
  return path
}

function versionOf(raw: RawRecord): string {
  const value = raw.schemaVersion
  if (typeof value === 'number') return value.toFixed(1)
  return typeof value === 'string' ? value : ''
}

/** Migrate a raw manifest to the current schema version. Throws when no path exists. */
export function migrateManifest(
  raw: RawRecord,
  migrations: readonly Migration[] = MIGRATIONS,
  target: string = CURRENT_SCHEMA_VERSION,
): RawRecord {
  let result = { ...raw, schemaVersion: versionOf(raw) }
  for (const migration of migrationPath(versionOf(raw), migrations, target)) {
    result = { ...migration.manifest(result), schemaVersion: migration.to }
  }
  return result
}

/**
 * Migrate one raw entity. Entities do not carry a version themselves; the caller applies
 * the same chain the manifest needed (`fromVersion`).
 */
export function migrateEntity(
  kind: EntityKind,
  raw: RawRecord,
  fromVersion: string = CURRENT_SCHEMA_VERSION,
  migrations: readonly Migration[] = MIGRATIONS,
  target: string = CURRENT_SCHEMA_VERSION,
): RawRecord {
  let result = raw
  for (const migration of migrationPath(fromVersion, migrations, target)) {
    result = migration.entity(kind, result)
  }
  return result
}
