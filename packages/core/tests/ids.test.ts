import { describe, expect, it } from 'vitest'

import { isSlug, slugify, uniqueSlug } from '../src/index'

describe('slugs', () => {
  it('accepts kebab-case and rejects everything else', () => {
    expect(isSlug('xunit')).toBe(true)
    expect(isSlug('test-design-2')).toBe(true)
    expect(isSlug('Test')).toBe(false)
    expect(isSlug('a--b')).toBe(false)
    expect(isSlug('-a')).toBe(false)
    expect(isSlug('a_b')).toBe(false)
    expect(isSlug('')).toBe(false)
    expect(isSlug('a'.repeat(65))).toBe(false)
  })

  it('slugifies display names', () => {
    expect(slugify('xUnit Testing!')).toBe('xunit-testing')
    expect(slugify('  .NET   Testing Expert ')).toBe('net-testing-expert')
    expect(slugify('Éléphant façade')).toBe('elephant-facade')
    expect(slugify('???')).toBe('')
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(64)
  })

  it('produces unique slugs with numeric suffixes', () => {
    expect(uniqueSlug('xUnit', [])).toBe('xunit')
    expect(uniqueSlug('xUnit', ['xunit'])).toBe('xunit-2')
    expect(uniqueSlug('xUnit', ['xunit', 'xunit-2'])).toBe('xunit-3')
    expect(uniqueSlug('???', ['item'], 'item')).toBe('item-2')
  })
})
