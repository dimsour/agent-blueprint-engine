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

  it('surfaces an unsupported version from readProject as a read error', async () => {
    const files = readFixtureFiles('dotnet-testing-expert')
    files['blueprint/blueprint.yaml'] = files['blueprint/blueprint.yaml']!.replace(
      'schemaVersion: "1.0"',
      'schemaVersion: "9.0"',
    )

    // A caller catches `ProjectReadError`; an error from the migration registry escaping past
    // it is the same failure wearing a type nobody handles.
    const error = await readProject(new MemoryFs(files)).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ProjectReadError)
    expect((error as ProjectReadError).code).toBe('UNSUPPORTED_SCHEMA_VERSION')
    expect((error as ProjectReadError).message).toContain('9.0')
    expect((error as ProjectReadError).path).toBe('blueprint/blueprint.yaml')
  })

  it('reports an empty migration chain for a project already at the current version', async () => {
    const { sourceSchemaVersion, migrations } = await readProject(
      new MemoryFs(readFixtureFiles('dotnet-testing-expert')),
    )
    expect(sourceSchemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrations).toEqual([])
  })
})
