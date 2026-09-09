'use client'

/**
 * The ten step bodies.
 *
 * Each one takes the draft and hands back a new one; none of them keep state. The logic they
 * call lives in `lib/wizard/draft`, so what is here is layout and wording only.
 */
import {
  AGENT_ROLES,
  type Blueprint,
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  type EntityRef,
  evaluateBlueprint,
  getCollection,
  type HarnessId,
  HARNESS_IDS,
  HARNESS_LABELS,
  MEMORY_SCOPES,
  summarizeDiagnostics,
  TOOL_KINDS,
  validateBlueprint,
} from '@agent-blueprint/core'
import { portabilityOf, portabilityProvider } from '@agent-blueprint/exporters'
import { templatesForKind } from '@agent-blueprint/templates/artifacts'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { SelectField, StringListField, TextAreaField, TextField } from '@/components/editors/fields'
import { DraftWithAI } from '@/components/wizard/ai-draft'
import { PermissionsGrid } from '@/components/editors/permissions-grid'
import { Button } from '@/components/ui/button'
import { Badge, Card, Input, Label } from '@/components/ui/primitives'
import { enabledTargetIds } from '@/lib/targets'
import {
  addBlank,
  addFromTemplate,
  DRAFT_PLACEHOLDER_NAME,
  primaryAgent,
  removeArtifact,
  setAgent,
  setIdentity,
  setTargets,
} from '@/lib/wizard/draft'

export interface StepProps {
  draft: Blueprint
  onChange: (draft: Blueprint) => void
}

// ---------------------------------------------------------------------------
// 1 · What are you building?
// ---------------------------------------------------------------------------

export function AboutStep({ draft, onChange }: StepProps) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <TextField
        label="Name"
        help="What this system is called. Everything else can change later."
        value={draft.name === DRAFT_PLACEHOLDER_NAME ? '' : draft.name}
        placeholder="Rust Review Crew"
        onChange={(name) => onChange(setIdentity(draft, { name }))}
      />
      <TextField
        label="Id"
        help="The project slug, used for the directory and every cross-reference."
        value={draft.id}
        mono
        onChange={(id) => onChange(setIdentity(draft, { id }))}
      />
      <TextAreaField
        label="Description"
        value={draft.description ?? ''}
        placeholder="Reviews Rust changes before they merge."
        onChange={(description) => onChange(setIdentity(draft, { description }))}
      />
      <DraftWithAI draft={draft} onChange={onChange} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2 · Who is the agent?
// ---------------------------------------------------------------------------

export function AgentStep({ draft, onChange }: StepProps) {
  const agent = primaryAgent(draft)

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <TextField
        label="Agent name"
        help="This agent's persona becomes the root instruction file every harness reads."
        value={agent?.name ?? ''}
        placeholder="Rust Reviewer"
        onChange={(name) => onChange(setAgent(draft, { name }))}
      />
      {agent ? (
        <>
          <SelectField
            label="Role"
            value={agent.role}
            options={AGENT_ROLES}
            onChange={(role) => onChange(setAgent(draft, { role }))}
          />
          <StringListField
            label="Expertise"
            help="What it knows well."
            values={agent.expertise}
            placeholder="Rust, ownership, async"
            onChange={(expertise) => onChange(setAgent(draft, { expertise }))}
          />
          <StringListField
            label="Responsibilities"
            help="What it is accountable for. Each one wants a skill behind it."
            values={agent.responsibilities}
            placeholder="Review changes before they merge"
            onChange={(responsibilities) => onChange(setAgent(draft, { responsibilities }))}
          />
        </>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3 to 7 · Artifacts, from templates or blank
// ---------------------------------------------------------------------------

function AddedList({
  draft,
  kind,
  onChange,
  rowExtra,
}: StepProps & {
  kind: EntityKind
  rowExtra?: (entity: { id: string; name: string }) => React.ReactNode
}) {
  const added = getCollection(draft, kind)
  if (added.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing added yet. This step is optional; you can add{' '}
        {ENTITY_KIND_INFO[kind].pluralLabel.toLowerCase()} later.
      </p>
    )
  }

  return (
    <ul aria-label={`Added ${ENTITY_KIND_INFO[kind].pluralLabel}`} className="flex flex-col gap-2">
      {added.map((entity) => (
        <li key={entity.id}>
          <Card className="flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{entity.name}</span>
              <span className="text-muted-foreground block truncate font-mono text-xs">
                {entity.id}
              </span>
            </span>
            {rowExtra?.({ id: entity.id, name: entity.name })}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${entity.name}`}
              onClick={() => onChange(removeArtifact(draft, { kind, id: entity.id } as EntityRef))}
            >
              <Trash2Icon />
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function BlankAdder({ draft, kind, onChange }: StepProps & { kind: EntityKind }) {
  const [name, setName] = useState('')
  const label = ENTITY_KIND_INFO[kind].label.toLowerCase()

  const add = () => {
    if (name.trim() === '') return
    onChange(addBlank(draft, kind, name.trim()).draft)
    setName('')
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={`add-${kind}`}>Add your own</Label>
        <Input
          id={`add-${kind}`}
          value={name}
          placeholder={`Name of a new ${label}`}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
      </div>
      <Button variant="outline" onClick={add} disabled={name.trim() === ''}>
        <PlusIcon />
        Add
      </Button>
    </div>
  )
}

export function ArtifactStep({
  draft,
  onChange,
  kind,
  rowExtra,
}: StepProps & {
  kind: EntityKind
  rowExtra?: (entity: { id: string; name: string }) => React.ReactNode
}) {
  const templates = useMemo(() => templatesForKind(kind), [kind])

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Start from a template</span>
          <ul className="grid gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <li key={template.id}>
                <Card className="hover:border-accent flex h-full flex-col gap-1 p-3 transition-colors">
                  <span className="text-sm font-medium">{template.label}</span>
                  <span className="text-muted-foreground flex-1 text-xs">
                    {template.description}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      const added = addFromTemplate(draft, template.id)
                      if (added) onChange(added.draft)
                    }}
                  >
                    <PlusIcon className="size-3" />
                    Add {template.label}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <BlankAdder draft={draft} kind={kind} onChange={onChange} />
      <AddedList
        draft={draft}
        kind={kind}
        onChange={onChange}
        {...(rowExtra ? { rowExtra } : {})}
      />
    </div>
  )
}

export function ToolsStep({ draft, onChange }: StepProps) {
  const agent = primaryAgent(draft)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ArtifactStep
        draft={draft}
        onChange={onChange}
        kind="tool"
        rowExtra={({ id, name }) => {
          const tool = draft.tools.find((candidate) => candidate.id === id)
          if (!tool) return null
          return (
            <span className="w-40 shrink-0">
              <SelectField
                label={`${name} kind`}
                value={tool.kind}
                options={TOOL_KINDS}
                onChange={(kind) => {
                  onChange({
                    ...draft,
                    tools: draft.tools.map((candidate) =>
                      candidate.id === id ? { ...candidate, kind } : candidate,
                    ),
                  })
                }}
              />
            </span>
          )
        }}
      />

      {agent ? (
        <PermissionsGrid
          permissions={agent.permissions}
          onChange={(permissions) => onChange(setAgent(draft, { permissions }))}
        />
      ) : null}
    </div>
  )
}

export function MemoryStep({ draft, onChange }: StepProps) {
  return (
    <ArtifactStep
      draft={draft}
      onChange={onChange}
      kind="memory"
      rowExtra={({ id, name }) => {
        const memory = draft.memories.find((candidate) => candidate.id === id)
        if (!memory) return null
        return (
          <span className="w-40 shrink-0">
            <SelectField
              label={`${name} scope`}
              value={memory.scope}
              options={MEMORY_SCOPES}
              onChange={(scope) => {
                onChange({
                  ...draft,
                  memories: draft.memories.map((candidate) =>
                    candidate.id === id ? { ...candidate, scope } : candidate,
                  ),
                })
              }}
            />
          </span>
        )
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// 8 · Where should it run?
// ---------------------------------------------------------------------------

export function TargetsStep({ draft, onChange }: StepProps) {
  const enabled = enabledTargetIds(draft)
  const portability = useMemo(() => portabilityOf(draft), [draft])

  const toggle = (id: HarnessId) => {
    const next = enabled.includes(id)
      ? enabled.filter((candidate) => candidate !== id)
      : [...enabled, id]
    onChange(setTargets(draft, next))
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Compile for</legend>
        <ul className="grid gap-2 pt-1 sm:grid-cols-2">
          {HARNESS_IDS.map((id) => (
            <li key={id}>
              <label className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" checked={enabled.includes(id)} onChange={() => toggle(id)} />
                {HARNESS_LABELS[id]}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-medium">Portability</span>
          <Badge variant={portability.score >= 90 ? 'success' : 'warning'}>
            {portability.score}
          </Badge>
        </span>
        {portability.issues.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Everything this Blueprint uses is supported on the harnesses you picked.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {portability.issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="text-muted-foreground text-xs">
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 9 · Evaluate
// ---------------------------------------------------------------------------

export function EvaluateStep({ draft }: StepProps) {
  const report = useMemo(() => {
    const diagnostics = validateBlueprint(draft)
    return {
      diagnostics,
      counts: summarizeDiagnostics(diagnostics),
      evaluation: evaluateBlueprint(draft, {
        diagnostics,
        portability: portabilityProvider({ targets: enabledTargetIds(draft) }),
      }),
    }
  }, [draft])

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="text-3xl font-semibold tabular-nums">{report.evaluation.overall}</span>
        <span className="text-muted-foreground text-sm">
          {report.counts.errors} errors · {report.counts.warnings} warnings · {report.counts.infos}{' '}
          suggestions
        </span>
      </div>

      <ul aria-label="Scores by dimension" className="flex flex-col gap-1.5">
        {report.evaluation.dimensions.map((dimension) => (
          <li key={dimension.id} className="flex items-center gap-3 text-sm">
            <span className="w-36 shrink-0">{dimension.label}</span>
            <span className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
              <span
                className={
                  dimension.score >= 70 ? 'bg-success block h-full' : 'bg-warning block h-full'
                }
                style={{ width: `${dimension.score}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums">{dimension.score}</span>
          </li>
        ))}
      </ul>

      {report.diagnostics.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Findings</span>
          <ul className="flex flex-col gap-1">
            {report.diagnostics.slice(0, 10).map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`} className="text-muted-foreground text-xs">
                <span className="font-mono">{diagnostic.code}</span> {diagnostic.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No findings. Nothing is blocking you.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 10 · Finish
// ---------------------------------------------------------------------------

export function FinishStep({ draft }: StepProps) {
  const present = useMemo(
    () =>
      ENTITY_KINDS.map((kind) => ({ kind, count: getCollection(draft, kind).length })).filter(
        (entry) => entry.count > 0,
      ),
    [draft],
  )

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{draft.name}</h2>
        <p className="text-muted-foreground font-mono text-xs">{draft.id}</p>
        {draft.description ? (
          <p className="text-muted-foreground text-sm">{draft.description}</p>
        ) : null}
      </div>

      <ul aria-label="What this Blueprint contains" className="flex flex-wrap gap-2">
        {present.map((entry) => (
          <li key={entry.kind}>
            <Badge variant="outline">
              {entry.count} {ENTITY_KIND_INFO[entry.kind].pluralLabel.toLowerCase()}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Compiles for</span>
        <span className="flex flex-wrap gap-2">
          {enabledTargetIds(draft).map((id) => (
            <Badge key={id} variant="accent">
              {HARNESS_LABELS[id]}
            </Badge>
          ))}
          {enabledTargetIds(draft).length === 0 ? (
            <span className="text-muted-foreground text-sm">
              No target chosen; you can pick one from the workspace.
            </span>
          ) : null}
        </span>
      </div>

      <p className="text-muted-foreground text-sm">
        Creating writes the project to this browser. The overview graph arrives in a later release;
        until then the workspace tree is the map.
      </p>
    </div>
  )
}
