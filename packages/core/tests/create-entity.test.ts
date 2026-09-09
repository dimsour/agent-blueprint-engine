import { beforeAll, describe, expect, it } from 'vitest'

import {
  type Blueprint,
  createEntity,
  ENTITY_KINDS,
  entitySchemaFor,
  getCollection,
  isSlug,
  upsertEntity,
  validateBlueprint,
} from '../src/index'
import { loadFixture } from './helpers'

let fixture: Blueprint

beforeAll(async () => {
  fixture = await loadFixture()
})

describe('createEntity', () => {
  it('produces a schema-valid artifact for every kind', () => {
    for (const kind of ENTITY_KINDS) {
      const entity = createEntity(fixture, kind, { name: 'New thing' })
      expect(entitySchemaFor(kind).safeParse(entity).success).toBe(true)
      expect(isSlug(entity.id)).toBe(true)
    }
  })

  it('derives the id from the name', () => {
    expect(createEntity(fixture, 'skill', { name: 'Property Based Testing' }).id).toBe(
      'property-based-testing',
    )
  })

  it('avoids an id that is already taken', () => {
    expect(createEntity(fixture, 'skill', { name: 'xUnit' }).id).toBe('xunit-2')
  })

  it('falls back to the kind when the name has no slug in it', () => {
    expect(createEntity(fixture, 'gate', { name: '!!!' }).id).toBe('gate')
  })

  it('honours an explicit id', () => {
    expect(createEntity(fixture, 'rule', { id: 'chosen', name: 'Anything' }).id).toBe('chosen')
  })

  it('seeds the fields the schema will not default', () => {
    expect(createEntity(fixture, 'agent', { name: 'Reviewer' }).role).toBe('worker')
    expect(createEntity(fixture, 'iron-law', { name: 'Never push to main' }).rule).toBe(
      'Never push to main',
    )
    expect(createEntity(fixture, 'requirement', { name: 'Tests run in CI' }).statement).toBe(
      'Tests run in CI',
    )
  })

  it('adds nothing the Blueprint would reject', () => {
    let blueprint = fixture
    for (const kind of ENTITY_KINDS) {
      blueprint = upsertEntity(
        blueprint,
        kind,
        createEntity(blueprint, kind, {
          name: `Fresh ${kind}`,
        }) as never,
      )
    }

    for (const kind of ENTITY_KINDS) {
      expect(getCollection(blueprint, kind).some((entity) => entity.name === `Fresh ${kind}`)).toBe(
        true,
      )
    }
    // New artifacts may well be incomplete, but never structurally broken.
    expect(validateBlueprint(blueprint).filter((d) => d.severity === 'error')).toEqual([])
  })
})
