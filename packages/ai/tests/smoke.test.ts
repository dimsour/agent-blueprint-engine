import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME } from '../src/index'

describe('@agent-blueprint/ai', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@agent-blueprint/ai')
  })
})
