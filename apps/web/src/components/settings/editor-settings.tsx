'use client'

/**
 * The editor preferences: today, whether an edit saves itself.
 *
 * Autosave is on by default because a closed tab should not cost work. Off is for someone
 * who wants to try an edit and walk away from it — with Save the only thing that writes,
 * and the top bar's "Unsaved" badge saying so until it does.
 */
import { useState } from 'react'

import { CheckboxField } from '@/components/editors/fields'
import { Card } from '@/components/ui/primitives'
import { useClientValue } from '@/lib/client-value'
import { readEditorSettings, writeEditorSettings } from '@/lib/editor-settings'

export function EditorSettings() {
  // A primitive, so the snapshot is stable across renders; the server assumes the default.
  const stored = useClientValue(() => readEditorSettings().autosave, true)
  const [chosen, setChosen] = useState<boolean | undefined>()
  const autosave = chosen ?? stored

  return (
    <Card className="flex flex-col gap-3 p-3">
      <CheckboxField
        label="Autosave"
        checked={autosave}
        text="Save edits automatically"
        help="On, the project is written about a second after every edit. Off, only Save (⌘S) writes it, and leaving the project drops what was not saved."
        onChange={(next) => {
          writeEditorSettings({ ...readEditorSettings(), autosave: next })
          setChosen(next)
        }}
      />
    </Card>
  )
}
