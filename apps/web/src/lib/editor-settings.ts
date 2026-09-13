/**
 * How the editor behaves for this person, in this browser.
 *
 * Preferences, not credentials: everything here could be printed on a poster, so it lives in
 * `localStorage` under the settings namespace beside the AI endpoint. Read at the moment it
 * matters rather than held in a store, so a change on the settings page applies to the next
 * edit without anything subscribing to it.
 */

export const EDITOR_SETTINGS_KEY = 'ab:settings:editor'

export interface EditorSettings {
  /**
   * Write the project about a second after the last edit. Off, an edit is written only by
   * Save (⌘S), and leaving the project drops what was not saved.
   */
  autosave: boolean
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = { autosave: true }

export function readEditorSettings(): EditorSettings {
  try {
    const stored = globalThis.localStorage?.getItem(EDITOR_SETTINGS_KEY)
    if (!stored) return DEFAULT_EDITOR_SETTINGS
    const parsed = JSON.parse(stored) as Partial<EditorSettings>
    return {
      ...DEFAULT_EDITOR_SETTINGS,
      ...(typeof parsed.autosave === 'boolean' ? { autosave: parsed.autosave } : {}),
    }
  } catch {
    return DEFAULT_EDITOR_SETTINGS
  }
}

export function writeEditorSettings(settings: EditorSettings): void {
  try {
    globalThis.localStorage?.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // A browser that refuses to store preferences still runs the app for this session.
  }
}
