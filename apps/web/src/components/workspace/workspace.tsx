'use client'

/**
 * The workspace: loads a project from local storage into the store and renders the IDE.
 *
 * The three regions are independent: the tree selects, the canvas edits, the inspector
 * explains. The graph editors (roadmap P4) replace the canvas in place without touching
 * either of the others.
 */
import { ENTITY_KIND_INFO, getCollection } from '@agent-blueprint/core'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { CommandPalette } from '@/components/command-palette/command-palette'
import { ExportDialog } from '@/components/export/export-dialog'
import { ArtifactEditor } from '@/components/editor/artifact-editor'
import { Inspector } from '@/components/inspector/inspector'
import { HealthBar } from '@/components/layout/health-bar'
import { IdeShell, PanelSection } from '@/components/layout/ide-shell'
import { TopBar } from '@/components/layout/top-bar'
import { ProjectTree } from '@/components/tree/project-tree'
import { Button } from '@/components/ui/button'
import { hasPreview } from '@/lib/artifact-source'
import { useShortcuts } from '@/lib/shortcuts'
import { openProject } from '@/lib/storage'
import { useWorkspace, workspaceHistory } from '@/lib/state/workspace-store'

export function Workspace({ projectId }: { projectId: string }) {
  const load = useWorkspace((state) => state.load)
  const blueprint = useWorkspace((state) => state.blueprint)
  const loadedId = useWorkspace((state) => state.projectId)
  const [error, setError] = useState<string | undefined>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  useShortcuts({
    palette: () => setPaletteOpen((current) => !current),
    export: () => setExportOpen(true),
    save: () => void useWorkspace.getState().save(),
    undo: workspaceHistory.undo,
    redo: workspaceHistory.redo,
    preview: () => {
      // Only artifacts stored as Markdown have a preview; on the others the key is free.
      const { selection, setArtifactTab } = useWorkspace.getState()
      if (selection && hasPreview(selection)) setArtifactTab('preview')
    },
  })

  useEffect(() => {
    let cancelled = false
    openProject(projectId)
      .then(({ blueprint: loaded, diagnostics }) => {
        if (!cancelled) load(projectId, loaded, diagnostics)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [projectId, load])

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
        <h1 className="text-lg font-semibold">That project could not be opened</h1>
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button asChild variant="outline">
          <Link href="/">Back to all projects</Link>
        </Button>
      </main>
    )
  }

  if (!blueprint || loadedId !== projectId) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm">Opening project…</p>
      </main>
    )
  }

  return (
    <>
      <IdeShell
        topBar={
          <TopBar onOpenPalette={() => setPaletteOpen(true)} onExport={() => setExportOpen(true)} />
        }
        sidebar={<ProjectTree />}
        inspector={<Inspector />}
        healthBar={<HealthBar />}
      >
        <Canvas />
      </IdeShell>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onExport={() => setExportOpen(true)}
      />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </>
  )
}

function Canvas() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const selection = useWorkspace((state) => state.selection)

  const entity = useMemo(() => {
    if (!blueprint || !selection) return undefined
    return getCollection(blueprint, selection.kind).find((item) => item.id === selection.id)
  }, [blueprint, selection])

  if (!blueprint) return null

  if (!entity || !selection) {
    return (
      <PanelSection title="Overview">
        <div className="flex flex-col gap-4 p-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{blueprint.name}</h1>
            {blueprint.description ? (
              <p className="text-muted-foreground mt-1 text-sm">{blueprint.description}</p>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            Choose an artifact on the left to inspect it.
          </p>
        </div>
      </PanelSection>
    )
  }

  return (
    <PanelSection
      title={
        <span className="flex items-center gap-2">
          {ENTITY_KIND_INFO[selection.kind].label}
          <span className="text-foreground normal-case">{entity.name}</span>
        </span>
      }
      scroll={false}
    >
      {/* Keyed so switching artifacts resets the tab and re-seeds the source editor. */}
      <ArtifactEditor key={`${selection.kind}:${selection.id}`} selection={selection} />
    </PanelSection>
  )
}
