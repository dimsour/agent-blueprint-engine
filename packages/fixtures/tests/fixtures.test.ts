import { describe, expect, it } from 'vitest'

import { FIXTURE_NAMES, readFixtureFiles } from '../src/index'

describe('fixtures', () => {
  it.each(FIXTURE_NAMES)('%s has a manifest', (name) => {
    const files = readFixtureFiles(name)
    expect(Object.keys(files)).toContain('blueprint/blueprint.yaml')
  })
})
