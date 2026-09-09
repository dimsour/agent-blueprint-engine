'use client'

/**
 * The Blueprint overview.
 *
 * A Blueprint is a graph, and until now the app only ever showed it as lists. This is the
 * one view where "what depends on what" is visible at a glance rather than one artifact at a
 * time, which is what makes an orphan or a lopsided agent obvious instead of discoverable.
 *
 * Positions are computed, never stored. Clicking a node selects the artifact, so the graph
 * is also a way of navigating rather than only a picture.
 */
import { ENTITY_KIND_INFO, type EntityKind } from '@agent-blueprint/core'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangleIcon, CircleAlertIcon, LoaderIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/primitives'
import { layoutGraph } from '@/lib/graph/layout'
import {
  kindColor,
  kindsPresent,
  type OverviewGraph as OverviewModel,
  type OverviewNode,
  overviewGraph,
  OVERVIEW_NODE_SIZE,
} from '@/lib/graph/overview'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/state/workspace-store'

type ArtifactNode = Node<{ artifact: OverviewNode; selected: boolean }, 'artifact'>

function ArtifactNodeView({ data }: NodeProps<ArtifactNode>) {
  const { artifact, selected } = data
  return (
    <div
      className={cn(
        'bg-card flex items-center gap-2 rounded-md border px-2.5 py-2 text-left shadow-sm',
        // The primary agent compiles to the root instruction file, which is the single most
        // consequential fact about a Blueprint's shape.
        artifact.isPrimary && 'border-success border-2',
        selected && 'border-accent ring-accent/40 ring-2',
        artifact.severity === 'error' && 'border-danger',
        artifact.severity === 'warning' && !selected && 'border-warning',
      )}
      style={{ width: OVERVIEW_NODE_SIZE.width, height: OVERVIEW_NODE_SIZE.height }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !border-0" />
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: kindColor(artifact.ref.kind) }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{artifact.name}</span>
        <span className="text-muted-foreground block truncate text-[10px]">
          {artifact.isPrimary ? `${artifact.kindLabel} · primary` : artifact.kindLabel}
        </span>
      </span>
      {/*
        An orphan always carries a warning too, so these cannot be alternatives: showing
        only the severity meant the orphan marker could never appear.
      */}
      {artifact.isOrphan ? (
        <span
          aria-hidden
          className="border-muted-foreground size-2 shrink-0 rounded-full border border-dashed"
          title="Nothing refers to this artifact"
        />
      ) : null}
      {artifact.severity === 'error' ? (
        <CircleAlertIcon className="text-danger size-3 shrink-0" />
      ) : artifact.severity === 'warning' ? (
        <AlertTriangleIcon className="text-warning size-3 shrink-0" />
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-border !border-0" />
    </div>
  )
}

const NODE_TYPES = { artifact: ArtifactNodeView }

function Graph({ kinds }: { kinds: ReadonlySet<EntityKind> }) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const selection = useWorkspace((state) => state.selection)
  const select = useWorkspace((state) => state.select)
  const { fitView } = useReactFlow()

  const model = useMemo(
    () =>
      blueprint
        ? overviewGraph(blueprint, { diagnostics, kinds: [...kinds] })
        : { nodes: [], edges: [] },
    [blueprint, diagnostics, kinds],
  )

  // The laid-out nodes are kept with the model they came from, so "is this current" is a
  // comparison rather than a second piece of state that has to be kept in step.
  const [layout, setLayout] = useState<{ model: OverviewModel; nodes: ArtifactNode[] }>()
  const [failed, setFailed] = useState<string>()
  const laidOut = layout?.model === model

  // Layout is asynchronous, so state is set from the callback, never in the effect body.
  useEffect(() => {
    let cancelled = false
    void layoutGraph(
      model.nodes.map((node) => ({ id: node.id, ...OVERVIEW_NODE_SIZE })),
      model.edges,
    )
      .then((positions) => {
        if (cancelled) return
        setLayout({
          model,
          nodes: model.nodes.map((node) => ({
            id: node.id,
            type: 'artifact' as const,
            position: positions[node.id] ?? { x: 0, y: 0 },
            data: { artifact: node, selected: false },
            draggable: false,
          })),
        })
      })
      .catch((error: unknown) => {
        // Without this the spinner below would run for ever behind an empty canvas.
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [model])

  // Selection is a paint, not a re-layout: rebuilding the nodes would move the whole graph.
  const painted = useMemo(
    () =>
      (layout?.model === model ? layout.nodes : []).map((node) => ({
        ...node,
        data: {
          ...node.data,
          selected:
            selection !== undefined &&
            node.data.artifact.ref.kind === selection.kind &&
            node.data.artifact.ref.id === selection.id,
        },
      })),
    [layout, model, selection],
  )

  const edges: Edge[] = useMemo(
    () =>
      model.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { stroke: 'var(--border)' },
      })),
    [model.edges],
  )

  useEffect(() => {
    if (laidOut) void fitView({ padding: 0.15, duration: 200 })
  }, [laidOut, fitView])

  const onNodeClick = useCallback(
    (_event: unknown, node: ArtifactNode) => select(node.data.artifact.ref),
    [select],
  )

  if (!blueprint) return null

  if (model.nodes.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        Nothing to draw. Add an artifact, or widen the filter.
      </p>
    )
  }

  return (
    <div className="relative h-full w-full">
      {failed ? (
        <p
          role="alert"
          className="text-danger absolute inset-0 z-10 flex items-center justify-center p-4 text-sm"
        >
          The graph could not be laid out: {failed}
        </p>
      ) : !laidOut ? (
        <p className="text-muted-foreground absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm">
          <LoaderIcon className="size-4 animate-spin" />
          Working out the shape…
        </p>
      ) : null}
      <ReactFlow
        nodes={painted}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        aria-label="Blueprint overview graph"
      >
        <Background gap={16} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function OverviewGraph() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const [hidden, setHidden] = useState<ReadonlySet<EntityKind>>(new Set())

  // Only kinds that exist are worth offering as a filter. Asking the model once per kind
  // rebuilt the whole dependency graph twelve times over.
  const present = useMemo(() => (blueprint ? kindsPresent(blueprint) : []), [blueprint])

  const shown = useMemo(
    () => new Set(present.filter((kind) => !hidden.has(kind))),
    [present, hidden],
  )

  if (!blueprint) return null

  const toggle = (kind: EntityKind) => {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  return (
    <div className="panel h-full">
      <div
        role="group"
        aria-label="Filter by kind"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2"
      >
        {present.map((kind) => {
          const on = shown.has(kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(kind)}
              className={cn(
                'flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs transition-colors',
                on ? 'text-foreground' : 'text-muted-foreground opacity-60',
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: kindColor(kind) }}
              />
              {ENTITY_KIND_INFO[kind].pluralLabel}
            </button>
          )
        })}
        <Badge variant="outline" className="ml-auto">
          derived, not stored
        </Badge>
      </div>

      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <Graph kinds={shown} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
