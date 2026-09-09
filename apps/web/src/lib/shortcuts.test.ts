import { describe, expect, it } from 'vitest'

import { isTyping, matchShortcut } from '@/lib/shortcuts'

const press = (
  key: string,
  modifiers: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', true>> = {},
) =>
  matchShortcut({
    key,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
  })

describe('matchShortcut', () => {
  it('accepts either modifier, so the same key works on every keyboard', () => {
    expect(press('k', { meta: true })).toBe('palette')
    expect(press('k', { ctrl: true })).toBe('palette')
  })

  it('ignores the key without a modifier', () => {
    expect(press('k')).toBeUndefined()
    expect(press('s')).toBeUndefined()
  })

  it('ignores a modifier combination that includes Alt', () => {
    expect(press('s', { ctrl: true, alt: true })).toBeUndefined()
  })

  it('maps the documented shortcuts', () => {
    expect(press('s', { meta: true })).toBe('save')
    expect(press('e', { meta: true })).toBe('export')
    expect(press('/', { meta: true })).toBe('ai')
    expect(press('p', { meta: true })).toBe('preview')
    expect(press('Enter', { meta: true })).toBe('apply')
    expect(press('z', { meta: true })).toBe('undo')
  })

  it('reads both spellings of redo', () => {
    expect(press('z', { meta: true, shift: true })).toBe('redo')
    expect(press('y', { ctrl: true })).toBe('redo')
  })

  it('does not treat an unrelated shifted key as a command', () => {
    expect(press('s', { meta: true, shift: true })).toBeUndefined()
  })

  it('is case-insensitive, because Shift changes the reported key', () => {
    expect(press('K', { meta: true })).toBe('palette')
  })
})

describe('isTyping', () => {
  it('recognises the places text goes', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTyping(document.createElement(tag))).toBe(true)
    }
    // The attribute, not the property: this is the shape the code editor renders.
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const inside = document.createElement('span')
    editable.append(inside)
    expect(isTyping(editable)).toBe(true)
    expect(isTyping(inside)).toBe(true)
  })

  it('does not mistake an ordinary element for a text field', () => {
    expect(isTyping(document.createElement('button'))).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})
