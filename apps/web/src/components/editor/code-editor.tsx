'use client'

/**
 * A CodeMirror 6 editor, kept deliberately thin.
 *
 * The editor owns the text while it is mounted and reports every change upward; it is never
 * re-seeded from props, because rewriting the document under someone's cursor is how editors
 * lose work. Switching artifacts or tabs unmounts it, which is where re-seeding belongs.
 */
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { useEffect, useRef } from 'react'

import { sectionSnippets } from '@/components/editor/snippets'

/** Colours come from the design tokens, so the editor follows the app's theme. */
const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    padding: '12px 0',
    caretColor: 'var(--foreground)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--background)',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--muted) 60%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-muted)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
  '.cm-panels': {
    backgroundColor: 'var(--surface)',
    color: 'var(--foreground)',
    borderColor: 'var(--border)',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--warning-muted)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--accent-muted)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent-muted)',
    color: 'var(--accent)',
  },
})

export interface CodeEditorProps {
  /** Initial document. Later changes to this prop are ignored; remount to re-seed. */
  initialValue: string
  language: 'markdown' | 'yaml'
  onChange: (value: string) => void
  ariaLabel: string
}

export function CodeEditor({ initialValue, language, onChange, ariaLabel }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  // The callback can change between renders; the extension reads the latest through a ref.
  // The ref is refreshed after each render rather than during it, because a render can be
  // thrown away and a discarded render must not leave a stale callback behind.
  const latestOnChange = useRef(onChange)
  useEffect(() => {
    latestOnChange.current = onChange
  })

  useEffect(() => {
    const parent = host.current
    if (!parent) return

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          foldGutter(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          history(),
          search({ top: true }),
          highlightSelectionMatches(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          language === 'yaml' ? yaml() : markdown(),
          // Markdown only: the sections are the ones the compiler and the rules look for.
          ...(language === 'markdown'
            ? [autocompletion({ override: [sectionSnippets] })]
            : [autocompletion()]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latestOnChange.current(update.state.doc.toString())
          }),
        ],
      }),
    })

    return () => view.destroy()
    // Remounting is the way to load a different document; see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-slot="code-editor" />
}
