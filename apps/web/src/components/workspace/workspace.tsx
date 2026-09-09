'use client'

/**
 * The workspace: loads a project from local storage into the store and renders the IDE.
 *
 * The canvas currently shows a read-only summary of the selected artifact. Editing forms
 * (roadmap P3-06), the Markdown editor (P3-07) and the graph (P4) replace it in place; the
 * shell, the tree, the inspector and the health bar do not change when they do.
 */
import { ENTITY_KIND_INFO, getCollection } from '@agent-blueprint/core'
import { AlertTriangleIcon, CircleAlertIcon, InfoIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { ArtifactEditor } from '@/components/editor/artifact-editor'
import { HealthBar } from '@/components/layout/health-bar'
import { IdeShell, PanelSection } from '@/components/layout/ide-shell'
import { TopBar } from '@/components/layout/top-bar'
import { ProjectTree } from '@/components/tree/project-tree'
import { Badge, Card } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { openProject } from '@/lib/storage'
import { diagnosticsFor, useWorkspace } from '@/lib/state/workspace-store'

export function Workspace({ projectId }: { projectId: string }) {
  const load = useWorkspace((state) => state.load)
  const blueprint = useWorkspace((state) => state.blueprint)
  const loadedId = useWorkspace((state) => state.projectId)
  const [error, setError] = useState<string | undefined>()

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
    <IdeShell
      topBar={<TopBar />}
      sidebar={<ProjectTree />}
      inspector={<Inspector />}
      healthBar={<HealthBar />}
    >
      <Canvas />
    </IdeShell>
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

function Inspector() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const selection = useWorkspace((state) => state.selection)
  const diagnostics = useWorkspace((state) => state.diagnostics)

  const own = useMemo(
    () => (selection ? diagnosticsFor(diagnostics, selection) : diagnostics.slice(0, 20)),
    [diagnostics, selection],
  )

  if (!blueprint) return null

  return (
    <PanelSection title={selection ? 'Inspector' : 'All findings'}>
      <div className="flex flex-col gap-2 p-3">
        {own.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {selection
              ? 'Nothing to report for this artifact.'
              : 'No findings. This Blueprint is clean.'}
          </p>
        ) : (
          own.map((diagnostic, index) => (
            <Card key={`${diagnostic.code}-${index}`} className="flex flex-col gap-1 p-2.5">
              <span className="flex items-center gap-1.5">
                {diagnostic.severity === 'error' ? (
                  <CircleAlertIcon className="text-danger size-3.5 shrink-0" />
                ) : diagnostic.severity === 'warning' ? (
                  <AlertTriangleIcon className="text-warning size-3.5 shrink-0" />
                ) : (
                  <InfoIcon className="text-muted-foreground size-3.5 shrink-0" />
                )}
                <Badge variant="outline" className="font-mono">
                  {diagnostic.code}
                </Badge>
              </span>
              <span className="text-sm">{diagnostic.message}</span>
            </Card>
          ))
        )}
      </div>
    </PanelSection>
  )
}
