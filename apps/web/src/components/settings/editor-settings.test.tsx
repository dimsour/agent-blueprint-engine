/**
 * The editor preferences.
 *
 * One promise: the box shows what is stored, and ticking it is what stores it. The store
 * reads the same key when an edit lands, so this is the whole contract of the switch.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { EditorSettings } from '@/components/settings/editor-settings'
import { EDITOR_SETTINGS_KEY, readEditorSettings } from '@/lib/editor-settings'

afterEach(() => {
  localStorage.removeItem(EDITOR_SETTINGS_KEY)
})

describe('EditorSettings', () => {
  it('is on until switched off, and remembers the switch', async () => {
    render(<EditorSettings />)
    const box = screen.getByRole('checkbox', { name: 'Save edits automatically' })
    expect(box).toBeChecked()

    await userEvent.click(box)
    expect(box).not.toBeChecked()
    expect(readEditorSettings().autosave).toBe(false)
    expect(localStorage.getItem(EDITOR_SETTINGS_KEY)).toBe('{"autosave":false}')
  })

  it('shows a stored choice', () => {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify({ autosave: false }))
    render(<EditorSettings />)
    expect(screen.getByRole('checkbox', { name: 'Save edits automatically' })).not.toBeChecked()
  })

  it('falls back to the default when the stored value is not usable', () => {
    localStorage.setItem(EDITOR_SETTINGS_KEY, '{"autosave":"maybe"')
    expect(readEditorSettings().autosave).toBe(true)
    localStorage.setItem(EDITOR_SETTINGS_KEY, '{"autosave":"maybe"}')
    expect(readEditorSettings().autosave).toBe(true)
  })
})
