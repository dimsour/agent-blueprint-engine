'use client'

/**
 * Visual, Source and Preview of one artifact.
 *
 * The Source tab is the project file itself, not a rendering of it: what is shown is what
 * `renderProjectFiles` would write, and what is typed is parsed back through the same schema.
 * While the text does not parse, the Blueprint keeps its last valid value and the other tabs
 * are unavailable, because switching away would silently discard the edit in progress.
 *
 * Both the tab and that error live in the store. The palette and the keyboard can change the
 * tab too, and a guard that only exists inside this component would not stop them.
 */
import { ENTITY_KIND_INFO, type EntityRef } from '@agent-blueprint/core'
import { AlertTriangleIcon, CodeIcon, EyeIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useState } from 'react'

import { EntityForm } from '@/components/editors/entity-form'
import { CodeEditor } from '@/components/editor/code-editor'
import { MarkdownPreview } from '@/components/editor/markdown-preview'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays'
import {
  bodyOf,
  hasPreview,
  parseEntitySource,
  renderEntitySource,
  sourceLanguage,
  sourcePathFor,
} from '@/lib/artifact-source'
import { type ArtifactTab, useWorkspace } from '@/lib/state/workspace-store'

export function ArtifactEditor({ selection }: { selection: EntityRef }) {
  // The tab lives in the store so a keyboard shortcut can reach it (docs/07, ⌘P).
  const tab = useWorkspace((state) => state.artifactTab)
  const setTab = useWorkspace((state) => state.setArtifactTab)
  const sourceError = useWorkspace((state) => state.sourceError)

  const language = sourceLanguage(selection)
  const blocked = sourceError !== undefined

  return (
    <Tabs
      value={tab}
      // The store refuses a move away from an unparseable file; this only forwards it.
      onValueChange={(next) => setTab(next as ArtifactTab)}
      className="panel flex-1"
    >
      <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3">
        <TabsList>
          <TabsTrigger value="visual" disabled={blocked}>
            <SlidersHorizontalIcon className="size-3" />
            Visual
          </TabsTrigger>
          <TabsTrigger value="source">
            <CodeIcon className="size-3" />
            {language === 'yaml' ? 'YAML' : 'Markdown'}
          </TabsTrigger>
          {hasPreview(selection) ? (
            <TabsTrigger value="preview" disabled={blocked}>
              <EyeIcon className="size-3" />
              Preview
            </TabsTrigger>
          ) : null}
        </TabsList>

        {blocked ? (
          <span className="text-danger flex min-w-0 items-center gap-1.5 text-xs">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            <span className="truncate">{sourceError}</span>
          </span>
        ) : (
          <SourcePath selection={selection} />
        )}
      </div>

      <TabsContent value="visual" className="overflow-auto">
        <EntityForm selection={selection} />
      </TabsContent>

      <TabsContent value="source" className="min-h-0">
        <SourceTab selection={selection} />
      </TabsContent>

      {hasPreview(selection) ? (
        <TabsContent value="preview" className="overflow-auto">
          <PreviewTab selection={selection} />
        </TabsContent>
      ) : null}
    </Tabs>
  )
}

function SourcePath({ selection }: { selection: EntityRef }) {
  const blueprint = useWorkspace((state) => state.blueprint)
  if (!blueprint) return null
  return (
    <span className="text-muted-foreground truncate font-mono text-xs">
      {sourcePathFor(blueprint, selection)}
    </span>
  )
}

function SourceTab({ selection }: { selection: EntityRef }) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const upsert = useWorkspace((state) => state.upsert)
  const setSourceError = useWorkspace((state) => state.setSourceError)

  // Seeded once, when the tab mounts. Switching tabs or artifacts remounts and re-seeds,
  // which is why the visual form and the source never drift.
  const [initialValue] = useState(() => (blueprint ? renderEntitySource(blueprint, selection) : ''))
  const [message, setMessage] = useState<string | undefined>()

  if (!blueprint) return null

  const handleChange = (text: string) => {
    const result = parseEntitySource(blueprint, selection, text)
    if (result.ok) {
      upsert(selection.kind, result.entity as never)
      setMessage(undefined)
      setSourceError(undefined)
      return
    }
    // The text stays exactly as typed; only the Blueprint declines to follow it.
    setMessage(result.message)
    setSourceError(result.message)
  }

  return (
    <div className="panel h-full">
      {message ? (
        <p
          role="alert"
          className="border-danger text-danger bg-danger-muted shrink-0 border-b px-3 py-1.5 text-xs"
        >
          Not applied: {message}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <CodeEditor
          initialValue={initialValue}
          language={sourceLanguage(selection)}
          onChange={handleChange}
          ariaLabel={`${ENTITY_KIND_INFO[selection.kind].label} source`}
        />
      </div>
    </div>
  )
}

function PreviewTab({ selection }: { selection: EntityRef }) {
  const blueprint = useWorkspace((state) => state.blueprint)
  if (!blueprint) return null
  return <MarkdownPreview body={bodyOf(blueprint, selection)} />
}
