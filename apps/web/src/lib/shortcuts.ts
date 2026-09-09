'use client'

/**
 * Keyboard shortcuts, per docs/07.
 *
 * The modifier is Meta or Control, whichever the keyboard sends, rather than a platform
 * sniff: the combination a person presses is the one that fires, on any machine.
 *
 * Typing takes precedence over commands. While the focus is in a text field or the code
 * editor, only the palette and Save fire; everything else, undo above all, belongs to the
 * field the cursor is in.
 */
import { useEffect, useRef } from 'react'

import { useClientValue } from '@/lib/client-value'

export type ShortcutId =
  'palette' | 'save' | 'export' | 'ai' | 'preview' | 'apply' | 'undo' | 'redo'

/** Shortcuts that fire even while the user is typing. */
const WHILE_TYPING: ReadonlySet<ShortcutId> = new Set<ShortcutId>(['palette', 'save'])

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** The shortcut this key event stands for, or undefined when it is just typing. */
export function matchShortcut(event: KeyEventLike): ShortcutId | undefined {
  const modifier = event.metaKey || event.ctrlKey
  if (!modifier || event.altKey) return undefined

  const key = event.key.toLowerCase()

  // Shift is part of redo, and on German, French and other layouts it is also how "/" is
  // typed at all, so that one combination has to survive the filter.
  if (event.shiftKey) {
    if (key === 'z') return 'redo'
    return key === '/' ? 'ai' : undefined
  }

  switch (key) {
    case 'k':
      return 'palette'
    case 's':
      return 'save'
    case 'e':
      return 'export'
    case '/':
      return 'ai'
    case 'p':
      return 'preview'
    case 'enter':
      return 'apply'
    case 'z':
      return 'undo'
    // Windows and Linux keyboards learned redo as Ctrl+Y long before Shift+Ctrl+Z.
    case 'y':
      return 'redo'
    default:
      return undefined
  }
}

/** True when the event came from somewhere the user is entering text. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // The attribute is checked as well as the property: the code editor is a contenteditable
  // host, and `isContentEditable` is one of the properties jsdom does not compute.
  return target.isContentEditable || target.closest('[contenteditable="true"]') !== null
}

/**
 * A handler returns `false` when it decided not to act, so the key keeps whatever the
 * browser would have done with it. Preview is the case that matters: ⌘P must still print
 * when the artifact on screen has nothing to preview.
 */
export type ShortcutHandlers = Partial<Record<ShortcutId, () => void | boolean>>

/**
 * Binds the shortcuts that have a handler. An unhandled shortcut is left to the browser, so
 * an unimplemented action still does whatever the browser would do rather than nothing.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  // Callers rebuild the map every render; the listener reads the latest through a ref so it
  // is attached once instead of being swapped on each keystroke elsewhere in the app.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const id = matchShortcut(event)
      if (!id) return
      if (isTyping(event.target) && !WHILE_TYPING.has(id)) return
      const handler = latest.current[id]
      if (!handler) return
      if (handler() === false) return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

const isMac = () => /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? '')

/**
 * How the modifier key is written on this machine: `⌘` on Apple keyboards, `Ctrl+` elsewhere.
 * The server renders the Windows and Linux spelling and hydration corrects it.
 */
export function useModifierLabel(): string {
  return useClientValue(isMac, false) ? '⌘' : 'Ctrl+'
}
