import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { describe, expect, it } from 'vitest'

import {
  CURRENT_SCHEMA_VERSION,
  MemoryFs,
  type Migration,
  migrateManifest,
  migrationPath,
  ProjectReadError,
  readProject,
  UnsupportedSchemaVersionError,
} from '../src/index'

const fake: Migration[] = [
  {
    from: '0.9',
    to: '1.0',
    description: 'rename title → name',
    manifest: (raw) => {
      const { title, ...rest } = raw
      return { ...rest, name: title }
    },
    entity: (_kind, raw) => raw,
  },
]

describe('migrations', () => {
  it('has no path for the current version', () => {
    expect(migrationPath(CURRENT_SCHEMA_VERSION)).toEqual([])
  })

  it('chains registered migrations', () => {
    expect(migrateManifest({ schemaVersion: '0.9', title: 'Old' }, fake)).toEqual({
      schemaVersion: '1.0',
      name: 'Old',
    })
    expect(migrateManifest({ schemaVersion: 0.9, title: 'Old' }, fake).schemaVersion).toBe('1.0')
  })

  it('fails loudly on unknown versions', () => {
    expect(() => migrateManifest({ schemaVersion: '7.3' })).toThrow(UnsupportedSchemaVersionError)
    expect(() => migrateManifest({})).toThrow(UnsupportedSchemaVersionError)
  })

  it('surfaces an unsupported version from readProject', async () => {
    const files = readFixtureFiles('dotnet-testing-expert')
    files['blueprint/blueprint.yaml'] = files['blueprint/blueprint.yaml']!.replace(
      'schemaVersion: "1.0"',
      'schemaVersion: "9.0"',
    )
    await expect(readProject(new MemoryFs(files))).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof UnsupportedSchemaVersionError || error instanceof ProjectReadError,
    )
  })
})
