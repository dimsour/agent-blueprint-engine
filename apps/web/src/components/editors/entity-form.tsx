'use client'

/**
 * The visual editor for one artifact.
 *
 * Every field writes straight back through the store, which routes through `upsertEntity`
 * and re-parses the entity with its Zod schema. That is what makes it impossible to build
 * an invalid Blueprint from the UI: an edit the schema rejects never becomes state.
 *
 * The id is not an ordinary field. It is the file name and the cross-reference key, so
 * changing it goes through `renameEntity`, which rewrites every reference to it.
 */
import {
  AGENT_ROLES,
  type AnyEntity,
  type Blueprint,
  ENTITY_KIND_INFO,
  type EntityKind,
  type EntityRef,
  GATE_CRITERION_KINDS,
  GATE_FAILURE_BEHAVIORS,
  getCollection,
  GOVERNANCE_CATEGORIES,
  HOOK_ACTION_TYPES,
  HOOK_FAILURE_BEHAVIORS,
  HOOK_TRIGGERS,
  IRON_LAW_SEVERITIES,
  MEMORY_SCOPES,
  MODEL_PREFERENCES,
  REFERENCE_KINDS,
  REQUIREMENT_LEVELS,
  RULE_PRIORITIES,
  SCENARIO_MODES,
  TOOL_KINDS,
} from '@agent-blueprint/core'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { exampleFor } from '@/components/editors/field-examples'
import {
  Field,
  RefListField,
  SelectField,
  StringListField,
  TagsField,
  TextAreaField,
  TextField,
} from '@/components/editors/fields'
import { PermissionsGrid } from '@/components/editors/permissions-grid'
import { ChecksField } from '@/components/editors/requirement-checks'
import { ResourcesField } from '@/components/editors/skill-resources'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/primitives'
import { fieldFindingsFor, hintsFor } from '@/lib/field-findings'
import { useWorkspace } from '@/lib/state/workspace-store'

/** Options for a reference picker: every artifact of a kind, by id and display name. */
function optionsFor(blueprint: Blueprint, kind: EntityKind): { id: string; name: string }[] {
  return getCollection(blueprint, kind).map((entity) => ({ id: entity.id, name: entity.name }))
}

/**
 * "New X" inside a picker: makes the artifact, links it, and stays put.
 *
 * Adding is deliberately separate from opening. Sending someone to the new artifact in the
 * middle of filling in another one loses their place, and the thing they were doing was
 * linking, not authoring.
 */
function useInlineCreate(
  kind: EntityKind,
  selected: readonly string[],
  link: (ids: string[]) => void,
) {
  const add = useWorkspace((state) => state.add)
  return () => {
    const ref = add(kind, `New ${ENTITY_KIND_INFO[kind].label.toLowerCase()}`)
    if (!ref) return
    link([...selected, ref.id])
    toast.success(`Added ${ENTITY_KIND_INFO[kind].label.toLowerCase()} ${ref.id}`, {
      description: 'It is linked here and waiting in the tree.',
    })
  }
}

/** A picker that can also create what it picks. */
function LinkField({
  label,
  kind,
  blueprint,
  selected,
  onChange,
  help,
  hints,
}: {
  label: string
  kind: EntityKind
  blueprint: Blueprint
  selected: readonly string[]
  onChange: (ids: string[]) => void
  help?: string
  hints?: ReturnType<typeof hintsFor>['hints']
}) {
  const create = useInlineCreate(kind, selected, onChange)
  return (
    <RefListField
      label={label}
      {...(help ? { help } : {})}
      {...(hints ? { hints } : {})}
      selected={selected}
      options={optionsFor(blueprint, kind)}
      onChange={onChange}
      onCreate={create}
      createLabel={`New ${ENTITY_KIND_INFO[kind].label.toLowerCase()}`}
    />
  )
}

export function EntityForm({ selection }: { selection: EntityRef }) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const upsert = useWorkspace((state) => state.upsert)
  const rename = useWorkspace((state) => state.rename)
  // The findings about this artifact, by field, so each control can show its own (P9-20).
  // Over the store's diagnostics, which are already recomputed on every edit.
  const hints = useMemo(() => fieldFindingsFor(diagnostics, selection), [diagnostics, selection])
  const hint = (field: string) => hintsFor(hints, field)
  const [rejected, setRejected] = useState<string | undefined>()

  const entity = blueprint
    ? getCollection(blueprint, selection.kind).find((item) => item.id === selection.id)
    : undefined

  if (!blueprint || !entity) {
    return <p className="text-muted-foreground p-4 text-sm">That artifact no longer exists.</p>
  }

  /**
   * Merges a patch into the entity and re-parses it through the schema. An edit the schema
   * rejects (a required field cleared mid-retype) is reported rather than thrown: the field
   * keeps what was typed and the Blueprint keeps its last valid value.
   */
  const update = (patch: Record<string, unknown>) => {
    try {
      upsert(selection.kind, {
        ...(entity as unknown as Record<string, unknown>),
        ...patch,
      } as never)
      setRejected(undefined)
    } catch (error) {
      setRejected(
        error instanceof Error ? error.message.split(String.fromCharCode(10))[0] : String(error),
      )
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5 p-4">
      {rejected ? (
        <p role="alert" className="border-danger text-danger rounded-md border px-3 py-2 text-xs">
          Not saved yet: {rejected}
        </p>
      ) : null}
      <IdentityFields
        entity={entity}
        kind={selection.kind}
        onRename={rename}
        update={update}
        hint={hint}
      />
      <KindFields
        kind={selection.kind}
        entity={entity as unknown as Record<string, unknown>}
        blueprint={blueprint}
        update={update}
        hint={hint}
      />
    </div>
  )
}

type Hint = (field: string) => ReturnType<typeof hintsFor>

function IdentityFields({
  entity,
  kind,
  onRename,
  update,
  hint,
}: {
  entity: AnyEntity
  kind: EntityKind
  onRename: (kind: EntityKind, oldId: string, newId: string) => void
  update: (patch: Record<string, unknown>) => void
  hint: Hint
}) {
  const [draftId, setDraftId] = useState(entity.id)
  const idChanged = draftId !== entity.id

  const commitRename = () => {
    if (!idChanged) return
    try {
      onRename(kind, entity.id, draftId)
      toast.success(`Renamed to ${draftId}`, {
        description: 'Every reference to it was updated.',
      })
    } catch (error) {
      toast.error('Could not rename', {
        description: error instanceof Error ? error.message : String(error),
      })
      setDraftId(entity.id)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Name"
        value={entity.name}
        onChange={(name) => update({ name })}
        help={`Display name of this ${ENTITY_KIND_INFO[kind].label.toLowerCase()}.`}
        {...exampleFor(kind, 'name')}
        {...hint('name')}
      />

      <Field
        label="Id"
        help="The file name and the key every reference uses. Renaming updates all of them."
        {...exampleFor(kind, 'id')}
        {...hint('id')}
        // An id is never empty, so inserting one always asks. It fills the box the same way
        // typing does — the rename itself still waits for the button, as it always has.
        hasContent
        onInsertExample={setDraftId}
      >
        <div className="flex items-center gap-1">
          <Input
            value={draftId}
            aria-label="Id"
            className="font-mono"
            onChange={(event) => setDraftId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') setDraftId(entity.id)
            }}
          />
          <Button variant="outline" size="sm" disabled={!idChanged} onClick={commitRename}>
            Rename
          </Button>
        </div>
      </Field>

      <TextAreaField
        label="Description"
        value={entity.description ?? ''}
        onChange={(description) => update({ description: description || undefined })}
        help="One or two sentences. Harnesses use this to decide when to load the artifact."
        {...exampleFor(kind, 'description')}
        {...hint('description')}
        rows={2}
      />

      <TagsField values={entity.tags} onChange={(tags) => update({ tags })} {...hint('tags')} />
    </div>
  )
}

interface KindFieldProps {
  kind: EntityKind
  entity: Record<string, unknown>
  blueprint: Blueprint
  update: (patch: Record<string, unknown>) => void
  hint: Hint
}

function KindFields({ kind, entity, blueprint, update, hint }: KindFieldProps) {
  const string = (key: string) => (entity[key] as string | undefined) ?? ''
  const list = (key: string) => (entity[key] as string[] | undefined) ?? []

  switch (kind) {
    case 'agent':
      return (
        <>
          <SelectField
            label="Role"
            value={string('role') as (typeof AGENT_ROLES)[number]}
            options={AGENT_ROLES}
            onChange={(role) => update({ role })}
            help="What this agent is for. Compiled into the subagent description."
          />
          <StringListField
            label="Responsibilities"
            values={list('responsibilities')}
            onChange={(responsibilities) => update({ responsibilities })}
            help="What it owns. Each one should be covered by a skill."
            {...exampleFor(kind, 'responsibilities')}
            {...hint('responsibilities')}
          />
          <StringListField
            label="Expertise"
            values={list('expertise')}
            onChange={(expertise) => update({ expertise })}
            {...exampleFor(kind, 'expertise')}
            {...hint('expertise')}
          />
          <StringListField
            label="Output requirements"
            values={list('outputRequirements')}
            onChange={(outputRequirements) => update({ outputRequirements })}
            help="What must be true before this agent reports work as done."
            {...exampleFor(kind, 'outputRequirements')}
            {...hint('outputRequirements')}
          />
          <LinkField
            label="Skills"
            kind="skill"
            blueprint={blueprint}
            selected={list('skillIds')}
            onChange={(skillIds) => update({ skillIds })}
            {...hint('skillIds')}
          />
          <LinkField
            label="Workflows"
            kind="workflow"
            blueprint={blueprint}
            selected={list('workflowIds')}
            onChange={(workflowIds) => update({ workflowIds })}
            {...hint('workflowIds')}
          />
          <LinkField
            label="Iron Laws"
            kind="iron-law"
            blueprint={blueprint}
            selected={list('ironLawIds')}
            onChange={(ironLawIds) => update({ ironLawIds })}
            {...hint('ironLawIds')}
          />
          <LinkField
            label="Rules"
            kind="rule"
            blueprint={blueprint}
            selected={list('ruleIds')}
            onChange={(ruleIds) => update({ ruleIds })}
            {...hint('ruleIds')}
          />
          <LinkField
            label="Tools"
            kind="tool"
            blueprint={blueprint}
            selected={list('toolIds')}
            onChange={(toolIds) => update({ toolIds })}
            {...hint('toolIds')}
          />
          <LinkField
            label="References"
            kind="reference"
            blueprint={blueprint}
            selected={list('referenceIds')}
            onChange={(referenceIds) => update({ referenceIds })}
            {...hint('referenceIds')}
          />
          <LinkField
            label="Memory"
            kind="memory"
            blueprint={blueprint}
            selected={list('memoryIds')}
            onChange={(memoryIds) => update({ memoryIds })}
            {...hint('memoryIds')}
          />
          <SelectField
            label="Model preference"
            value={
              ((entity['model'] as { preference?: string } | undefined)?.preference ??
                'balanced') as (typeof MODEL_PREFERENCES)[number]
            }
            options={MODEL_PREFERENCES}
            onChange={(preference) =>
              // Spread the existing model so a hint written in the project file survives.
              update({
                model: { ...(entity['model'] as Record<string, unknown> | undefined), preference },
              })
            }
            help="Compiled to a concrete model per harness: fast, balanced or strong."
          />
          <RefListField
            label="Can delegate to"
            help="Other agents this one may hand work to. Compiles to the harness's subagent wiring."
            selected={
              ((entity['delegation'] as { canDelegateTo?: string[] } | undefined)?.canDelegateTo ??
                []) as string[]
            }
            options={optionsFor(blueprint, 'agent').filter(
              (option) => option.id !== (entity['id'] as string),
            )}
            onChange={(canDelegateTo) =>
              // Absent rather than empty: an agent that delegates to nobody has no delegation.
              update({ delegation: canDelegateTo.length > 0 ? { canDelegateTo } : undefined })
            }
          />
          <PermissionsGrid
            permissions={entity['permissions'] as never}
            onChange={(permissions) => update({ permissions })}
            {...hint('permissions')}
          />
          <BodyField label="Persona" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'skill':
      return (
        <>
          <TextAreaField
            label="When to use"
            value={string('whenToUse')}
            onChange={(whenToUse) => update({ whenToUse: whenToUse || undefined })}
            help="The sentence a harness reads to decide whether to load this skill."
            {...exampleFor(kind, 'whenToUse')}
            {...hint('whenToUse')}
            rows={2}
          />
          <ActivationFields entity={entity} update={update} hint={hint} />
          <LinkField
            label="References"
            kind="reference"
            blueprint={blueprint}
            selected={list('referenceIds')}
            onChange={(referenceIds) => update({ referenceIds })}
            help="Copied next to the skill so it stays self-contained."
          />
          <LinkField
            label="Allowed tools"
            kind="tool"
            blueprint={blueprint}
            selected={list('allowedToolIds')}
            onChange={(allowedToolIds) => update({ allowedToolIds })}
          />
          <ResourcesField entity={entity} update={update} />
          <BodyField label="Instructions" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'workflow':
      return (
        <>
          <StringListField
            label="Trigger intents"
            values={(entity['triggers'] as { intents?: string[] } | undefined)?.intents ?? []}
            onChange={(intents) =>
              update({ triggers: { ...(entity['triggers'] as object), intents } })
            }
            help="Requests that should start this workflow."
            {...exampleFor(kind, 'intents')}
            {...hint('triggers')}
          />
          <Field
            label="Steps"
            help="Steps are drawn on the Graph tab. This is only what is there now."
          >
            <p className="text-muted-foreground text-sm">
              {(entity['nodes'] as unknown[] | undefined)?.length ?? 0} steps,{' '}
              {(entity['edges'] as unknown[] | undefined)?.length ?? 0} connections.
            </p>
          </Field>
          <BodyField label="Notes" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'iron-law':
      return (
        <>
          <TextAreaField
            label="Rule"
            value={string('rule')}
            onChange={(rule) => update({ rule })}
            help="One or two imperative sentences. This is the law itself."
            {...exampleFor(kind, 'rule')}
            {...hint('rule')}
          />
          <TextAreaField
            label="Rationale"
            value={string('rationale')}
            onChange={(rationale) => update({ rationale: rationale || undefined })}
            help="Why it exists. A law the agent understands is followed more reliably."
            {...exampleFor(kind, 'rationale')}
            {...hint('rationale')}
          />
          <TextAreaField
            label="If it cannot be honoured"
            value={string('violationBehavior')}
            onChange={(violationBehavior) =>
              update({ violationBehavior: violationBehavior || undefined })
            }
            help="Without this, an agent that cannot comply will invent its own way out."
            {...exampleFor(kind, 'violationBehavior')}
            {...hint('violationBehavior')}
            rows={2}
          />
          <SelectField
            label="Severity"
            value={string('severity') as (typeof IRON_LAW_SEVERITIES)[number]}
            options={IRON_LAW_SEVERITIES}
            onChange={(severity) => update({ severity })}
          />
          <SelectField
            label="Category"
            value={string('category') as (typeof GOVERNANCE_CATEGORIES)[number]}
            options={GOVERNANCE_CATEGORIES}
            onChange={(category) => update({ category })}
          />
          <StringListField
            label="Examples"
            values={list('examples')}
            onChange={(examples) => update({ examples })}
            {...exampleFor(kind, 'examples')}
            {...hint('examples')}
          />
          <StringListField
            label="Counterexamples"
            values={list('counterexamples')}
            onChange={(counterexamples) => update({ counterexamples })}
            {...exampleFor(kind, 'counterexamples')}
            {...hint('counterexamples')}
          />
          <BodyField label="Notes" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'rule':
      return (
        <>
          <TextAreaField
            label="Guidance"
            value={string('guidance')}
            onChange={(guidance) => update({ guidance })}
            {...exampleFor(kind, 'guidance')}
            {...hint('guidance')}
          />
          <SelectField
            label="Priority"
            value={string('priority') as (typeof RULE_PRIORITIES)[number]}
            options={RULE_PRIORITIES}
            onChange={(priority) => update({ priority })}
          />
          <SelectField
            label="Category"
            value={string('category') as (typeof GOVERNANCE_CATEGORIES)[number]}
            options={GOVERNANCE_CATEGORIES}
            onChange={(category) => update({ category })}
          />
          <StringListField
            label="Applies to"
            values={list('paths')}
            onChange={(paths) => update({ paths })}
            placeholder="**/*.ts"
            help="File globs. Harnesses that support path-scoped rules load it only for these."
            {...exampleFor(kind, 'paths')}
            {...hint('paths')}
          />
          <BodyField label="Notes" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'hook':
      return (
        <>
          <SelectField
            label="Trigger"
            value={string('trigger') as (typeof HOOK_TRIGGERS)[number]}
            options={HOOK_TRIGGERS}
            onChange={(trigger) => update({ trigger })}
            help="The lifecycle event that fires it."
            {...hint('trigger')}
          />
          <SelectField
            label="Action"
            value={
              ((entity['action'] as { type?: string } | undefined)?.type ??
                'command') as (typeof HOOK_ACTION_TYPES)[number]
            }
            options={HOOK_ACTION_TYPES}
            onChange={(type) => update({ action: { ...(entity['action'] as object), type } })}
            {...hint('action.type')}
          />
          <TextField
            label="Command"
            mono
            value={(entity['action'] as { command?: string } | undefined)?.command ?? ''}
            onChange={(command) =>
              update({ action: { ...(entity['action'] as object), command: command || undefined } })
            }
            help="Run verbatim by every harness that supports command hooks."
            {...exampleFor(kind, 'command')}
            {...hint('action.command')}
          />
          <SelectField
            label="On failure"
            value={string('onFailure') as (typeof HOOK_FAILURE_BEHAVIORS)[number]}
            options={HOOK_FAILURE_BEHAVIORS}
            onChange={(onFailure) => update({ onFailure })}
          />
        </>
      )

    case 'gate':
      return (
        <>
          <SelectField
            label="If it fails"
            value={string('onFail') as (typeof GATE_FAILURE_BEHAVIORS)[number]}
            options={GATE_FAILURE_BEHAVIORS}
            onChange={(onFail) => update({ onFail })}
          />
          <CriteriaFields entity={entity} update={update} hint={hint} />
        </>
      )

    case 'tool':
      return (
        <>
          <SelectField
            label="Kind"
            value={string('kind') as (typeof TOOL_KINDS)[number]}
            options={TOOL_KINDS}
            onChange={(value) => update({ kind: value })}
          />
          <StringListField
            label="Operations"
            values={list('operations')}
            onChange={(operations) => update({ operations })}
            {...exampleFor(kind, 'operations')}
            {...hint('operations')}
          />
        </>
      )

    case 'reference':
      return (
        <>
          <SelectField
            label="Kind"
            value={string('kind') as (typeof REFERENCE_KINDS)[number]}
            options={REFERENCE_KINDS}
            onChange={(value) => update({ kind: value })}
          />
          <TextField
            label="Source URL"
            value={string('url')}
            onChange={(url) => update({ url: url || undefined })}
            {...exampleFor(kind, 'url')}
            {...hint('url')}
          />
          <BodyField label="Content" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'memory':
      return (
        <>
          <SelectField
            label="Scope"
            value={string('scope') as (typeof MEMORY_SCOPES)[number]}
            options={MEMORY_SCOPES}
            onChange={(scope) => update({ scope })}
            help="How long it survives. Harnesses without memory get this as instructions."
          />
          <StringListField
            label="Categories"
            values={list('categories')}
            onChange={(categories) => update({ categories })}
            help="What is worth remembering."
            {...exampleFor(kind, 'categories')}
            {...hint('categories')}
          />
          <BodyField label="Seed" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'requirement':
      return (
        <>
          <TextAreaField
            label="Statement"
            value={string('statement')}
            onChange={(statement) => update({ statement })}
            help="A claim that must hold about this Blueprint."
            {...exampleFor(kind, 'statement')}
            {...hint('statement')}
          />
          <SelectField
            label="Level"
            value={string('level') as (typeof REQUIREMENT_LEVELS)[number]}
            options={REQUIREMENT_LEVELS}
            onChange={(level) => update({ level })}
            help="An unmet `must` is an error; an unmet `should` is a warning."
          />
          <ChecksField entity={entity} blueprint={blueprint} update={update} {...hint('checks')} />
          <BodyField label="Notes" kind={kind} entity={entity} update={update} hint={hint} />
        </>
      )

    case 'scenario':
      return (
        <>
          <RefListField
            label="Agent"
            help="Which agent this scenario exercises. Click the selected one to clear it."
            selected={string('agentId') ? [string('agentId')] : []}
            options={optionsFor(blueprint, 'agent')}
            // One agent, not a set: the last click wins, and deselecting means no agent.
            onChange={(ids) => update({ agentId: ids.at(-1) ?? undefined })}
          />
          <TextAreaField
            label="Input"
            value={string('input')}
            onChange={(input) => update({ input })}
            help="The request the agent is given."
            {...exampleFor(kind, 'input')}
            {...hint('input')}
          />
          <SelectField
            label="Mode"
            value={string('mode') as (typeof SCENARIO_MODES)[number]}
            options={SCENARIO_MODES}
            onChange={(mode) => update({ mode })}
          />
          <StringListField
            label="Expected behaviours"
            values={(
              (entity['expectedBehaviors'] as { description: string }[] | undefined) ?? []
            ).map((behavior) => behavior.description)}
            onChange={(descriptions) =>
              update({ expectedBehaviors: descriptions.map((description) => ({ description })) })
            }
            {...exampleFor(kind, 'expectedBehaviors')}
            {...hint('expectedBehaviors')}
          />
        </>
      )
  }
}

/**
 * The artifact's Markdown body. Its label and its example both depend on the kind — a
 * persona, a set of instructions and a memory seed are three different pieces of writing.
 */
function BodyField({
  label,
  kind,
  entity,
  update,
  hint,
}: {
  label: string
  kind: EntityKind
  entity: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  hint: Hint
}) {
  return (
    <TextAreaField
      label={label}
      mono
      rows={16}
      value={(entity['body'] as string | undefined) ?? ''}
      onChange={(body) => update({ body })}
      help="Markdown. The Markdown tab above edits the same text as the file, with a preview."
      {...exampleFor(kind, 'body')}
      {...hint('body')}
    />
  )
}

function ActivationFields({
  entity,
  update,
  hint,
}: {
  entity: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  hint: Hint
}) {
  const activation = (entity['activation'] ?? {}) as Record<string, string[]>
  const set = (key: string, values: string[]) =>
    update({ activation: { ...activation, [key]: values } })

  return (
    <>
      <StringListField
        label="File patterns"
        values={activation['filePatterns'] ?? []}
        onChange={(values) => set('filePatterns', values)}
        placeholder="**/*.test.ts"
        help="Claude Code and Copilot load the skill only when a matching file is read."
        {...exampleFor('skill', 'filePatterns')}
        {...hint('activation')}
      />
      <StringListField
        label="Intents"
        values={activation['intents'] ?? []}
        onChange={(values) => set('intents', values)}
        placeholder="write tests"
        help="Phrases in a request that should bring this skill in."
        {...exampleFor('skill', 'intents')}
      />
      <StringListField
        label="File types"
        values={activation['fileTypes'] ?? []}
        onChange={(values) => set('fileTypes', values)}
        placeholder="TypeScript"
        {...exampleFor('skill', 'fileTypes')}
      />
    </>
  )
}

function CriteriaFields({
  entity,
  update,
  hint,
}: {
  entity: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  hint: Hint
}) {
  const criteria = (entity['criteria'] ?? []) as {
    kind: string
    description?: string
    command?: string
  }[]

  const setCriterion = (index: number, patch: Record<string, unknown>) => {
    update({
      criteria: criteria.map((criterion, position) =>
        position === index ? { ...criterion, ...patch } : criterion,
      ),
    })
  }

  return (
    <Field
      label="Criteria"
      help="Every one must hold before the workflow may continue."
      {...hint('criteria')}
    >
      <div className="flex flex-col gap-3">
        {criteria.map((criterion, index) => (
          // Keyed by position: criteria have no id, and the fields below are re-labelled
          // by position too, so a removal renumbers the whole list consistently.
          <div key={index} className="flex flex-col gap-2 rounded-md border p-3">
            <SelectField
              label={`Criterion ${index + 1} kind`}
              value={criterion.kind as (typeof GATE_CRITERION_KINDS)[number]}
              options={GATE_CRITERION_KINDS}
              onChange={(kind) => setCriterion(index, { kind })}
            />
            <TextField
              label={`Criterion ${index + 1} description`}
              value={criterion.description ?? ''}
              onChange={(description) => setCriterion(index, { description })}
              {...exampleFor('gate', 'criterionDescription')}
            />
            <TextField
              label={`Criterion ${index + 1} command`}
              mono
              value={criterion.command ?? ''}
              onChange={(command) => setCriterion(index, { command: command || undefined })}
              help="A criterion with a command compiles to a real hook; without one it is an instruction."
              {...exampleFor('gate', 'criterionCommand')}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update({ criteria: criteria.filter((_, position) => position !== index) })
              }
            >
              Remove criterion {index + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            update({ criteria: [...criteria, { kind: 'tests-pass', description: '' }] })
          }
        >
          Add criterion
        </Button>
      </div>
    </Field>
  )
}
