'use client'

/**
 * The panel for one step, or one connection.
 *
 * A step's configuration is a flat bag of optional fields on purpose, so that changing a
 * step's type does not lose what was already written. This shows the fields that type
 * actually uses, and nothing else, which is what makes the bag readable.
 *
 * It is also the only place a connection can be made without a mouse, and the only place the
 * kind of a connection is chosen while making it: dragging between two handles always draws
 * a sequential edge, and a keyboard user has no drag at all.
 */
import {
  type Blueprint,
  getCollection,
  MERGE_STRATEGIES,
  NODE_FAILURE_BEHAVIORS,
  VERIFICATION_METHODS,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  WORKFLOW_EDGE_KINDS,
  WORKFLOW_NODE_TYPES,
} from '@agent-blueprint/core'
import { ArrowRightIcon, FlagIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import {
  Field,
  RefListField,
  SelectField,
  StringListField,
  TextAreaField,
  TextField,
} from '@/components/editors/fields'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { EDGE_KIND_INFO, type EdgeKind, type NodeType, NODE_TYPE_INFO } from '@/lib/graph/steps'
import {
  connect,
  removeEdge,
  removeNode,
  setEntry,
  updateEdge,
  updateNode,
  updateNodeConfig,
} from '@/lib/graph/workflow'

export interface InspectorProps {
  workflow: Workflow
  blueprint: Blueprint
  onChange: (workflow: Workflow) => void
  onClearSelection: () => void
}

function refOptions(blueprint: Blueprint, kind: Parameters<typeof getCollection>[1]) {
  return getCollection(blueprint, kind).map((entity) => ({ id: entity.id, name: entity.name }))
}

/**
 * The method a verification step uses.
 *
 * Both controls read it through here, because they used to disagree: the picker showed one
 * default and typing a command wrote another, so a step could be saved as something other
 * than what the panel had been showing all along.
 */
function verificationMethod(
  config: Record<string, unknown>,
): (typeof VERIFICATION_METHODS)[number] {
  const method = (config['verification'] as { method?: string } | undefined)?.method
  return VERIFICATION_METHODS.includes(method as (typeof VERIFICATION_METHODS)[number])
    ? (method as (typeof VERIFICATION_METHODS)[number])
    : 'command'
}

/** What this step leads to, and the way to add one more without dragging. */
function Connections({
  node,
  workflow,
  onChange,
}: {
  node: WorkflowNode
  workflow: Workflow
  onChange: (workflow: Workflow) => void
}) {
  const [kind, setKind] = useState<EdgeKind>('sequential')

  const outgoing = workflow.edges.filter((edge) => edge.from === node.id)
  const labelOf = (id: string) => workflow.nodes.find((step) => step.id === id)?.label ?? id
  const candidates = workflow.nodes
    .filter((step) => step.id !== node.id)
    .filter((step) => !outgoing.some((edge) => edge.to === step.id))
    .map((step) => ({ id: step.id, name: step.label }))

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <Field label="Leads to">
        {outgoing.length === 0 ? (
          <p className="text-muted-foreground text-xs">Nothing yet.</p>
        ) : (
          <ul aria-label="Leads to" className="flex flex-col gap-1">
            {outgoing.map((edge) => (
              <li key={edge.id} className="flex items-center gap-1.5 text-xs">
                <ArrowRightIcon className="text-muted-foreground size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{labelOf(edge.to)}</span>
                <Badge variant="outline">{edge.kind}</Badge>
                <button
                  type="button"
                  aria-label={`Disconnect ${labelOf(edge.to)}`}
                  onClick={() => onChange(removeEdge(workflow, edge.id))}
                  className="hover:bg-muted rounded p-0.5"
                >
                  <Trash2Icon className="text-danger size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <SelectField
        label="Kind of the next connection"
        value={kind}
        options={WORKFLOW_EDGE_KINDS}
        onChange={setKind}
        help={EDGE_KIND_INFO[kind].hint}
      />

      <RefListField
        label="Connect to"
        selected={[]}
        options={candidates}
        onChange={(ids) => {
          const to = ids.at(-1)
          if (to) onChange(connect(workflow, node.id, to, kind))
        }}
        help="Choosing a step draws the connection. Dragging between two steps does the same, always as sequential."
      />
    </div>
  )
}

export function NodePanel({
  node,
  workflow,
  blueprint,
  onChange,
  onClearSelection,
}: InspectorProps & { node: WorkflowNode }) {
  const info = NODE_TYPE_INFO[node.type]
  const isEntry = workflow.entryNodeId === node.id
  const config = node.config as Record<string, unknown>

  const setConfig = (patch: Record<string, unknown>) =>
    onChange(updateNodeConfig(workflow, node.id, patch))

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <Badge variant="accent">{info.label}</Badge>
        {isEntry ? <Badge variant="success">Entry</Badge> : null}
        <span className="text-muted-foreground ml-auto font-mono text-xs">{node.id}</span>
      </div>

      <TextField
        label="Label"
        value={node.label}
        onChange={(label) => onChange(updateNode(workflow, node.id, { label }))}
        help="What this step is called in the compiled instructions."
      />

      <SelectField
        label="Step type"
        value={node.type}
        options={WORKFLOW_NODE_TYPES}
        onChange={(type) => onChange(updateNode(workflow, node.id, { type: type as NodeType }))}
        help={info.hint}
      />

      {info.refField === 'agentId' ? (
        <RefListField
          label="Agent"
          selected={config['agentId'] ? [config['agentId'] as string] : []}
          options={refOptions(blueprint, 'agent')}
          onChange={(ids) => setConfig({ agentId: ids.at(-1) })}
        />
      ) : null}
      {info.refField === 'skillId' ? (
        <RefListField
          label="Skill"
          selected={config['skillId'] ? [config['skillId'] as string] : []}
          options={refOptions(blueprint, 'skill')}
          onChange={(ids) => setConfig({ skillId: ids.at(-1) })}
        />
      ) : null}
      {info.refField === 'toolId' ? (
        <RefListField
          label="Tool"
          selected={config['toolId'] ? [config['toolId'] as string] : []}
          options={refOptions(blueprint, 'tool')}
          onChange={(ids) => setConfig({ toolId: ids.at(-1) })}
        />
      ) : null}
      {info.refField === 'gateId' ? (
        <RefListField
          label="Gate"
          selected={config['gateId'] ? [config['gateId'] as string] : []}
          options={refOptions(blueprint, 'gate')}
          onChange={(ids) => setConfig({ gateId: ids.at(-1) })}
        />
      ) : null}

      {node.type === 'condition' ? (
        <TextField
          label="Condition"
          value={(config['expression'] as string | undefined) ?? ''}
          onChange={(expression) => setConfig({ expression: expression || undefined })}
          help="The question this step asks, in the words the agent will read."
        />
      ) : null}

      {node.type === 'verification' ? (
        <>
          <SelectField
            label="How it is verified"
            value={verificationMethod(config)}
            options={VERIFICATION_METHODS}
            onChange={(method) =>
              setConfig({
                verification: {
                  ...(config['verification'] as Record<string, unknown> | undefined),
                  method,
                },
              })
            }
          />
          <TextField
            label="Command"
            mono
            value={(config['verification'] as { command?: string } | undefined)?.command ?? ''}
            onChange={(command) =>
              setConfig({
                verification: {
                  method: verificationMethod(config),
                  ...(command ? { command } : {}),
                },
              })
            }
            help="With a command this compiles to a real check; without one it is an instruction."
          />
        </>
      ) : null}

      {node.type === 'merge' ? (
        <SelectField
          label="Merge strategy"
          value={(config['mergeStrategy'] ?? 'all') as (typeof MERGE_STRATEGIES)[number]}
          options={MERGE_STRATEGIES}
          onChange={(mergeStrategy) => setConfig({ mergeStrategy })}
        />
      ) : null}

      {node.type === 'retry' ? (
        <TextField
          label="Attempts"
          value={String(config['maxAttempts'] ?? '')}
          onChange={(value) => {
            const parsed = Number.parseInt(value, 10)
            setConfig({ maxAttempts: Number.isFinite(parsed) ? parsed : undefined })
          }}
          help="How many times, at most. Without a limit the compiled instructions cannot say when to stop."
        />
      ) : null}

      {node.type === 'human-approval' ? (
        <TextAreaField
          label="What to ask"
          rows={3}
          value={(config['approvalPrompt'] as string | undefined) ?? ''}
          onChange={(approvalPrompt) => setConfig({ approvalPrompt: approvalPrompt || undefined })}
        />
      ) : null}

      <StringListField
        label="Context"
        values={(config['contextInputs'] ?? []) as string[]}
        onChange={(contextInputs) => setConfig({ contextInputs })}
        placeholder="the plan, the changed files…"
        help="What this step is given to work with."
      />

      <TextField
        label="Output"
        value={(config['outputSpec'] as string | undefined) ?? ''}
        onChange={(outputSpec) => setConfig({ outputSpec: outputSpec || undefined })}
        help="What it must produce before the next step runs."
      />

      <SelectField
        label="On failure"
        value={(config['onFailure'] ?? 'stop') as (typeof NODE_FAILURE_BEHAVIORS)[number]}
        options={NODE_FAILURE_BEHAVIORS}
        onChange={(onFailure) => setConfig({ onFailure })}
      />

      <Connections node={node} workflow={workflow} onChange={onChange} />

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={isEntry}
          onClick={() => onChange(setEntry(workflow, node.id))}
        >
          <FlagIcon className="size-3" />
          Set as entry
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onChange(removeNode(workflow, node.id))
            onClearSelection()
          }}
        >
          <Trash2Icon className="text-danger size-3" />
          Delete step
        </Button>
      </div>
    </div>
  )
}

export function EdgePanel({
  edge,
  workflow,
  onChange,
  onClearSelection,
}: Omit<InspectorProps, 'blueprint'> & { edge: WorkflowEdge }) {
  const from = workflow.nodes.find((node) => node.id === edge.from)
  const to = workflow.nodes.find((node) => node.id === edge.to)

  return (
    <div className="flex flex-col gap-4 p-3">
      <p className="text-sm">
        <span className="font-medium">{from?.label ?? edge.from}</span>
        <span className="text-muted-foreground"> to </span>
        <span className="font-medium">{to?.label ?? edge.to}</span>
      </p>

      <SelectField
        label="Connection"
        value={edge.kind}
        options={WORKFLOW_EDGE_KINDS}
        onChange={(kind) => onChange(updateEdge(workflow, edge.id, { kind }))}
        help={EDGE_KIND_INFO[edge.kind].hint}
      />

      {edge.kind === 'conditional' ? (
        <TextField
          label="Taken when"
          value={edge.condition ?? ''}
          onChange={(condition) =>
            onChange(updateEdge(workflow, edge.id, { condition: condition || undefined }))
          }
        />
      ) : null}

      <TextField
        label="Label"
        value={edge.label ?? ''}
        onChange={(label) => onChange(updateEdge(workflow, edge.id, { label: label || undefined }))}
        help="Drawn on the connection, for anything the kind does not already say."
      />

      <Field
        label="Required"
        help="A required connection must complete before the workflow goes on."
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={edge.required}
            onChange={(event) =>
              onChange(updateEdge(workflow, edge.id, { required: event.target.checked }))
            }
          />
          This step waits for it
        </label>
      </Field>

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          onChange(removeEdge(workflow, edge.id))
          onClearSelection()
        }}
      >
        <Trash2Icon className="text-danger size-3" />
        Delete connection
      </Button>
    </div>
  )
}
