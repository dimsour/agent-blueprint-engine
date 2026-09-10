'use client'

/**
 * The workflow editor.
 *
 * A workflow is the one part of a Blueprint that is genuinely a drawing: an ordered graph
 * with branches, gates and retries, which reads as a shape and compiles to a list of steps.
 * Editing it as frontmatter was always going to be the weakest part of the product.
 *
 * Positions are part of the workflow and are written to the project file, so a drag is a
 * change like any other and goes through the store. It is committed when the drag ends
 * rather than on every frame, because a hundred autosaves per gesture helps nobody.
 */
import type { Workflow } from '@agent-blueprint/core'
import { type ArtifactTemplate, workflowTemplates } from '@agent-blueprint/templates/artifacts'
import {
  Background,
  type Connection,
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
import {
  AlertTriangleIcon,
  CircleAlertIcon,
  FlagIcon,
  PlusIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { EdgePanel, NodePanel } from '@/components/graph/workflow/node-inspector'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import {
  EDGE_KIND_INFO,
  nodeColor,
  type NodeType,
  NODE_TYPE_INFO,
  WORKFLOW_NODE_SIZE,
} from '@/lib/graph/steps'
import {
  addNode,
  connect,
  diagnosticsByNode,
  insertSubgraph,
  moveNode,
  removeEdge,
  removeNode,
  tidy,
} from '@/lib/graph/workflow'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/state/workspace-store'

type StepNode = Node<
  {
    label: string
    type: NodeType
    isEntry: boolean
    severity?: 'error' | 'warning'
    note?: string
  },
  'step'
>

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  return (
    <div
      className={cn(
        'bg-card flex items-center gap-2 rounded-md border px-2.5 py-2 shadow-sm',
        selected && 'border-accent ring-accent/40 ring-2',
        data.severity === 'error' && 'border-danger',
        data.severity === 'warning' && !selected && 'border-warning',
      )}
      style={{ width: WORKFLOW_NODE_SIZE.width, height: WORKFLOW_NODE_SIZE.height }}
      title={data.note ?? undefined}
    >
      <Handle type="target" position={Position.Top} />
      <span
        aria-hidden
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: nodeColor(data.type) }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{data.label}</span>
        <span className="text-muted-foreground block truncate text-[10px]">
          {NODE_TYPE_INFO[data.type].label}
        </span>
      </span>
      {data.isEntry ? <FlagIcon className="text-success size-3 shrink-0" /> : null}
      {data.severity === 'error' ? (
        <CircleAlertIcon className="text-danger size-3 shrink-0" />
      ) : data.severity === 'warning' ? (
        <AlertTriangleIcon className="text-warning size-3 shrink-0" />
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const NODE_TYPES = { step: StepNodeView }

/** Below everything already drawn, so a step added without dragging is visible and alone. */
function nextFreeSpot(workflow: Workflow): { x: number; y: number } {
  if (workflow.nodes.length === 0) return { x: 0, y: 0 }
  const bottom = workflow.nodes.reduce((edge, node) => Math.max(edge, node.position.y), 0)
  return { x: 0, y: bottom + WORKFLOW_NODE_SIZE.height + 48 }
}

/** Schema errors are several lines long; the first one says what is wrong. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split(String.fromCharCode(10))[0] ?? message
}

/**
 * The steps a workflow template is made of.
 *
 * A template builds a whole workflow as a change-set; inserting one means taking its graph
 * and leaving its name, description and body alone, because those belong to the workflow
 * being edited.
 */
function subgraphOf(template: ArtifactTemplate): Pick<Workflow, 'nodes' | 'edges'> | undefined {
  const op = template.build({ id: 'inserted', name: template.label }).ops[0]
  if (!op || op.type !== 'create') return undefined
  const built = op.after as Workflow
  return { nodes: built.nodes, edges: built.edges }
}

function Canvas({
  workflow,
  onChange,
  selected,
  onSelect,
}: {
  workflow: Workflow
  onChange: (workflow: Workflow) => void
  selected: { kind: 'node' | 'edge'; id: string } | undefined
  onSelect: (selection: { kind: 'node' | 'edge'; id: string } | undefined) => void
}) {
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const { screenToFlowPosition } = useReactFlow()

  const byNode = useMemo(
    () => diagnosticsByNode(diagnostics, workflow.id),
    [diagnostics, workflow.id],
  )

  const nodes: StepNode[] = useMemo(
    () =>
      workflow.nodes.map((node) => {
        const found = byNode.get(node.id) ?? []
        const severity = found.some((d) => d.severity === 'error')
          ? ('error' as const)
          : found.some((d) => d.severity === 'warning')
            ? ('warning' as const)
            : undefined
        return {
          id: node.id,
          type: 'step' as const,
          position: node.position,
          selected: selected?.kind === 'node' && selected.id === node.id,
          data: {
            label: node.label,
            type: node.type,
            isEntry: workflow.entryNodeId === node.id,
            ...(severity ? { severity } : {}),
            ...(found.length > 0 ? { note: found.map((d) => d.message).join('\n') } : {}),
          },
        }
      }),
    [workflow, byNode, selected],
  )

  const edges: Edge[] = useMemo(
    () =>
      workflow.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label:
          edge.label ?? (edge.kind === 'sequential' ? undefined : EDGE_KIND_INFO[edge.kind].label),
        selected: selected?.kind === 'edge' && selected.id === edge.id,
        animated: edge.kind === 'parallel',
        style: {
          stroke:
            selected?.kind === 'edge' && selected.id === edge.id
              ? 'var(--accent)'
              : 'var(--border)',
          strokeDasharray: EDGE_KIND_INFO[edge.kind].dashed ? '4 4' : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      })),
    [workflow.edges, selected],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      onChange(connect(workflow, connection.source, connection.target))
    },
    [workflow, onChange],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onConnect={onConnect}
      onNodeClick={(_event, node) => onSelect({ kind: 'node', id: node.id })}
      onEdgeClick={(_event, edge) => onSelect({ kind: 'edge', id: edge.id })}
      onPaneClick={() => onSelect(undefined)}
      // Committed on drag stop: a change per frame would be a hundred autosaves per gesture.
      onNodeDragStop={(_event, node) => onChange(moveNode(workflow, node.id, node.position))}
      // One handler, so deleting a step and the edges that reached it is a single change:
      // React Flow calls the edge and node handlers separately for the same gesture, and two
      // commits would cost two presses of undo to put back.
      onDelete={({ nodes: goneNodes, edges: goneEdges }) => {
        if (goneNodes.length === 0 && goneEdges.length === 0) return
        const withoutEdges = goneEdges.reduce(
          (current, edge) => removeEdge(current, edge.id),
          workflow,
        )
        onChange(goneNodes.reduce((current, node) => removeNode(current, node.id), withoutEdges))
        onSelect(undefined)
      }}
      onDrop={(event) => {
        event.preventDefault()
        const type = event.dataTransfer.getData('application/agent-blueprint-node')
        if (!type) return
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        const { workflow: next, nodeId } = addNode(workflow, type as NodeType, position)
        onChange(next)
        onSelect({ kind: 'node', id: nodeId })
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      // React Flow deletes on Backspace alone, which is the Mac key. Delete is the one people
      // reach for, and on a full keyboard Backspace is where you go back a page. Both, then.
      // Neither fires while a text field has the focus, so typing in the step panel is safe.
      deleteKeyCode={['Delete', 'Backspace']}
      fitView
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      aria-label={`${workflow.name} steps`}
    >
      <Background gap={16} size={1} color="var(--border)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const upsert = useWorkspace((state) => state.upsert)
  // Navigating from a finding names the step it is about, so the editor opens on it. Read
  // as state rather than only as an initial value: the second such navigation would
  // otherwise do nothing, because the editor is already mounted.
  const focusNodeId = useWorkspace((state) => state.focusNodeId)
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | undefined>(
    focusNodeId ? { kind: 'node', id: focusNodeId } : undefined,
  )
  const [lastFocus, setLastFocus] = useState(focusNodeId)
  if (focusNodeId !== lastFocus) {
    setLastFocus(focusNodeId)
    setSelected(focusNodeId ? { kind: 'node', id: focusNodeId } : undefined)
  }
  const [tidying, setTidying] = useState(false)
  const [rejected, setRejected] = useState<string | undefined>()

  const workflow = blueprint?.workflows.find((candidate) => candidate.id === workflowId)
  if (!blueprint || !workflow) return null

  /**
   * Every edit re-parses the whole workflow, and the schema rejects the moment between
   * clearing a label and retyping it, or an attempt count on its way past twenty. The forms
   * have always reported that rather than throwing; a change handler that throws takes the
   * editor down with it, and there is no boundary to catch it.
   */
  const onChange = (next: Workflow) => {
    try {
      upsert('workflow', next)
      setRejected(undefined)
    } catch (error) {
      setRejected(firstLine(error))
    }
  }

  const selectedNode =
    selected?.kind === 'node' ? workflow.nodes.find((node) => node.id === selected.id) : undefined
  const selectedEdge =
    selected?.kind === 'edge' ? workflow.edges.find((edge) => edge.id === selected.id) : undefined

  return (
    <div className="flex h-full min-h-0">
      <div
        role="group"
        aria-label="Step palette"
        className="flex w-40 shrink-0 flex-col gap-1 overflow-auto border-r p-2"
      >
        <span className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
          Steps
        </span>
        <span className="text-muted-foreground px-1 pb-1 text-[11px] leading-snug">
          One at a time. Drag one onto the canvas, or click to place it below.
        </span>
        {(Object.keys(NODE_TYPE_INFO) as NodeType[]).map((type) => (
          <button
            key={type}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/agent-blueprint-node', type)
              event.dataTransfer.effectAllowed = 'move'
            }}
            // Dragging is the natural gesture; clicking adds it below what is already drawn,
            // for anyone who cannot drag, which includes every keyboard user. The origin
            // would stack every click on the same spot, possibly off screen.
            onClick={() => {
              const { workflow: next, nodeId } = addNode(workflow, type, nextFreeSpot(workflow))
              onChange(next)
              setSelected({ kind: 'node', id: nodeId })
            }}
            title={NODE_TYPE_INFO[type].hint}
            className="hover:bg-muted flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: nodeColor(type) }}
            />
            <span className="truncate">{NODE_TYPE_INFO[type].label}</span>
          </button>
        ))}
      </div>

      <div className="panel min-w-0 flex-1">
        {rejected ? (
          <p
            role="alert"
            className="border-danger text-danger bg-danger-muted shrink-0 border-b px-3 py-1.5 text-xs"
          >
            Not applied: {rejected}
          </p>
        ) : null}

        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
          <Badge variant="outline">{workflow.nodes.length} steps</Badge>
          <Badge variant="outline">{workflow.edges.length} connections</Badge>
          {/*
            Named for what it does. It used to say "Insert a shape", meaning the shape a
            workflow has — but a shape on a canvas is a box, so it read as the way to add one
            step, and the way to add one step is the palette on the left. The menu says so too.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                title="A ready-made workflow, every step at once. For one step, use the palette on the left."
              >
                <PlusIcon className="size-3" />
                Insert a whole workflow
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
              <DropdownMenuLabel>
                Every step of a template, at once
                <span className="text-muted-foreground mt-0.5 block text-[11px] font-normal">
                  For a single step, use the palette on the left.
                </span>
              </DropdownMenuLabel>
              {workflowTemplates.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onSelect={() => {
                    const built = subgraphOf(template)
                    if (!built) return
                    const { workflow: next, nodeIds } = insertSubgraph(workflow, built)
                    onChange(next)
                    toast.success(`Inserted ${template.label}`, {
                      description: `${nodeIds.length} steps, waiting to be connected.`,
                    })
                  }}
                >
                  {template.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            disabled={tidying || workflow.nodes.length === 0}
            onClick={() => {
              setTidying(true)
              void tidy(workflow)
                .then((next) => {
                  // Laying out takes a moment, and anything edited meanwhile would be
                  // silently discarded by writing the version we started from.
                  const current = useWorkspace
                    .getState()
                    .blueprint?.workflows.find((candidate) => candidate.id === workflowId)
                  if (!current || current !== workflow) {
                    toast.info('Tidy was skipped', {
                      description: 'The workflow changed while it was being laid out.',
                    })
                    return
                  }
                  onChange(next)
                  toast.success('Tidied the graph', {
                    description: 'The same layout every time, so the file does not churn.',
                  })
                })
                .catch((error: unknown) => {
                  toast.error('Could not lay the graph out', { description: firstLine(error) })
                })
                .finally(() => setTidying(false))
            }}
          >
            <WandSparklesIcon className="size-3" />
            Tidy
          </Button>
        </div>

        <div className="relative min-h-0 flex-1">
          <ReactFlowProvider>
            <Canvas
              workflow={workflow}
              onChange={onChange}
              selected={selected}
              onSelect={setSelected}
            />
          </ReactFlowProvider>

          {/*
            Over the canvas rather than beside it. A third column would squeeze the toolbar
            out of a workspace that already has a tree and an inspector, and the panel is
            only wanted while something is selected anyway.
          */}
          {selectedNode || selectedEdge ? (
            <aside
              aria-label="Step settings"
              className="bg-surface absolute inset-y-0 right-0 z-10 w-72 overflow-auto border-l shadow-lg"
            >
              {selectedNode ? (
                <NodePanel
                  node={selectedNode}
                  workflow={workflow}
                  blueprint={blueprint}
                  onChange={onChange}
                  onClearSelection={() => setSelected(undefined)}
                />
              ) : selectedEdge ? (
                <EdgePanel
                  edge={selectedEdge}
                  workflow={workflow}
                  onChange={onChange}
                  onClearSelection={() => setSelected(undefined)}
                />
              ) : null}
            </aside>
          ) : (
            <p className="text-muted-foreground pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs">
              Drag a step from the left, or drag between two steps to connect them. Select one and
              press Delete to remove it.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
