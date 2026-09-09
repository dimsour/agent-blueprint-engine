'use client'

/**
 * The workspace: loads a project from local storage into the store and renders the IDE.
 *
 * The three regions are independent: the tree selects, the canvas edits, the inspector
 * explains. The graph editors sit in the canvas as one more tab, so adding them touched
 * neither of the others.
 */
import { ENTITY_KIND_INFO, ENTITY_KINDS, getCollection } from '@agent-blueprint/core'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { CommandPalette } from '@/components/command-palette/command-palette'
import { OverviewGraph } from '@/components/graph/overview/overview-graph'
import { CompatibilityView } from '@/components/views/compatibility-view'
import { EvaluationView } from '@/components/views/evaluation-view'
import { ExportView } from '@/components/views/export-view'
import { ArtifactEditor } from '@/components/editor/artifact-editor'
import { Inspector } from '@/components/inspector/inspector'
import { HealthBar } from '@/components/layout/health-bar'
import { IdeShell, PanelSection } from '@/components/layout/ide-shell'
import { TopBar } from '@/components/layout/top-bar'
import { ProjectTree } from '@/components/tree/project-tree'
import { Button } from '@/components/ui/button'
import { validateNow } from '@/lib/actions'
import { useUrlState } from '@/lib/use-url-state'
import { entityOf, hasPreview } from '@/lib/artifact-source'
import { useShortcuts } from '@/lib/shortcuts'
import { openProject } from '@/lib/storage'
import { useWorkspace, workspaceHistory } from '@/lib/state/workspace-store'

export function Workspace({ projectId }: { projectId: string }) {
  const load = useWorkspace((state) => state.load)
  const blueprint = useWorkspace((state) => state.blueprint)
  const loadedId = useWorkspace((state) => state.projectId)
  const [error, setError] = useState<string | undefined>()
  const [paletteOpen, setPaletteOpen] = useState(false)

  /** Export is a section of the workspace, so every route to it lands in the same place. */
  const showExport = () => {
    const state = useWorkspace.getState()
    state.select(undefined)
    state.setView('export')
  }

  // `?view=` and `&id=` make an artifact linkable; the sync runs once the project is in.
  useUrlState(projectId, blueprint !== undefined && loadedId === projectId)

  useShortcuts({
    palette: () => setPaletteOpen((current) => !current),
    export: () => showExport(),
    save: () => void useWorkspace.getState().save(),
    undo: workspaceHistory.undo,
    redo: workspaceHistory.redo,
    preview: () => {
      // Only artifacts stored as Markdown have a preview. Declining leaves the key to the
      // browser, so Print still works everywhere else.
      const { selection, setArtifactTab } = useWorkspace.getState()
      if (!selection || !hasPreview(selection)) return false
      setArtifactTab('preview')
      return true
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
          <TopBar
            onOpenPalette={() => setPaletteOpen(true)}
            onExport={showExport}
            onValidate={() => void validateNow()}
          />
        }
        sidebar={<ProjectTree />}
        inspector={<Inspector />}
        healthBar={<HealthBar />}
      >
        <Canvas />
      </IdeShell>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}

/**
 * What the canvas shows with nothing selected: the whole Blueprint as a graph, or one kind
 * of artifact as a list.
 */
function Overview() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const view = useWorkspace((state) => state.view)
  const select = useWorkspace((state) => state.select)
  const setView = useWorkspace((state) => state.setView)
  // The graph is the better first look at a Blueprint; the list is better for counting.
  const [showGraph, setShowGraph] = useState(true)

  const counts = useMemo(
    () =>
      blueprint
        ? ENTITY_KINDS.map((kind) => ({ kind, count: getCollection(blueprint, kind).length }))
        : [],
    [blueprint],
  )

  if (!blueprint) return null

  if (view === 'evaluation') {
    return (
      <PanelSection title="Evaluation">
        <EvaluationView />
      </PanelSection>
    )
  }

  if (view === 'compatibility') {
    return (
      <PanelSection title="Compatibility">
        <CompatibilityView />
      </PanelSection>
    )
  }

  if (view === 'export') {
    return (
      <PanelSection title="Export" scroll={false}>
        <ExportView />
      </PanelSection>
    )
  }

  if (view !== 'overview') {
    const entities = getCollection(blueprint, view)
    return (
      <PanelSection title={ENTITY_KIND_INFO[view].pluralLabel}>
        <div className="flex flex-col gap-3 p-4">
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setView('overview')}
          >
            All artifacts
          </Button>
          {entities.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No {ENTITY_KIND_INFO[view].pluralLabel.toLowerCase()} yet.
            </p>
          ) : (
            <ul className="flex max-w-2xl flex-col gap-2">
              {entities.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => select({ kind: view, id: item.id })}
                    className="hover:border-accent w-full rounded-lg border p-3 text-left transition-colors"
                  >
                    <span className="block text-sm font-medium">{item.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {item.description ?? item.id}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PanelSection>
    )
  }

  return (
    <PanelSection
      title={
        <span className="flex items-center gap-2">
          Overview
          <span className="text-foreground normal-case">{blueprint.name}</span>
        </span>
      }
      scroll={false}
      actions={
        <button
          type="button"
          onClick={() => setShowGraph((current) => !current)}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          {showGraph ? 'Show the list' : 'Show the graph'}
        </button>
      }
    >
      {showGraph ? (
        <OverviewGraph />
      ) : (
        <div className="flex flex-col gap-4 overflow-auto p-4">
          {blueprint.description ? (
            <p className="text-muted-foreground text-sm">{blueprint.description}</p>
          ) : null}
          <ul aria-label="Artifacts by kind" className="grid max-w-2xl gap-2 sm:grid-cols-3">
            {counts.map(({ kind, count }) => (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => setView(kind)}
                  className="hover:border-accent flex w-full items-baseline justify-between gap-2 rounded-lg border p-3 text-left transition-colors"
                >
                  <span className="text-sm">{ENTITY_KIND_INFO[kind].pluralLabel}</span>
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelSection>
  )
}

function Canvas() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const selection = useWorkspace((state) => state.selection)

  const entity = useMemo(
    () => (blueprint && selection ? entityOf(blueprint, selection) : undefined),
    [blueprint, selection],
  )

  if (!blueprint) return null

  if (!entity || !selection) return <Overview />

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
