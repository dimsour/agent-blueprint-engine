'use client'

/**
 * The requirement check builder.
 *
 * Checks are what make "satisfied" a computed fact instead of an opinion, so leaving them
 * editable only in the project file left requirements decorative in the app. Each type asks
 * for exactly the fields its schema requires, and changing the type drops the fields that no
 * longer apply rather than carrying them along as dead weight.
 */
import {
  type Blueprint,
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  GATE_CRITERION_KINDS,
  getCollection,
  HOOK_ACTION_TYPES,
  HOOK_TRIGGERS,
  REQUIREMENT_CHECK_TYPES,
  WORKFLOW_NODE_TYPES,
} from '@agent-blueprint/core'
import { PlusIcon } from 'lucide-react'

import {
  Field,
  RefListField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/editors/fields'
import { Button } from '@/components/ui/button'

type Check = Record<string, unknown>
type CheckType = (typeof REQUIREMENT_CHECK_TYPES)[number]

function optionsFor(blueprint: Blueprint, kind: EntityKind) {
  return getCollection(blueprint, kind).map((entity) => ({ id: entity.id, name: entity.name }))
}

/** The smallest valid shape for each type, so a new check parses the moment it is added. */
function defaultsFor(type: CheckType): Check {
  switch (type) {
    case 'workflow-has-node-type':
      return { nodeType: 'verification' }
    case 'iron-law-matches':
      return { pattern: 'never' }
    case 'agent-has-skill-tag':
      return { tag: 'testing' }
    case 'text-mentions':
      return { pattern: 'verify', kinds: [] }
    case 'ai-judged':
      return { prompt: 'Does this Blueprint satisfy the requirement?' }
    case 'hook-exists':
    case 'gate-exists':
      // Both are satisfied by any hook or gate; narrowing them is optional.
      return {}
  }
}

function CheckFields({
  check,
  index,
  blueprint,
  set,
}: {
  check: Check
  index: number
  blueprint: Blueprint
  set: (patch: Check) => void
}) {
  const label = (name: string) => `Check ${index + 1} ${name}`
  const text = (key: string) => (check[key] as string | undefined) ?? ''

  switch (check['type'] as CheckType) {
    case 'workflow-has-node-type':
      return (
        <>
          <SelectField
            label={label('node type')}
            value={(check['nodeType'] ?? 'verification') as (typeof WORKFLOW_NODE_TYPES)[number]}
            options={WORKFLOW_NODE_TYPES}
            onChange={(nodeType) => set({ nodeType })}
          />
          <RefListField
            label={label('workflow')}
            help="Leave empty to accept the node type in any workflow."
            selected={text('workflowId') ? [text('workflowId')] : []}
            options={optionsFor(blueprint, 'workflow')}
            onChange={(ids) => set({ workflowId: ids.at(-1) })}
          />
        </>
      )
    case 'iron-law-matches':
      return (
        <TextField
          label={label('pattern')}
          mono
          value={text('pattern')}
          onChange={(pattern) => set({ pattern })}
          help="A case-insensitive regular expression, tested against every Iron Law."
        />
      )
    case 'hook-exists':
      return (
        <>
          <SelectField
            label={label('trigger')}
            value={(check['trigger'] ?? 'before-stop') as (typeof HOOK_TRIGGERS)[number]}
            options={HOOK_TRIGGERS}
            onChange={(trigger) => set({ trigger })}
          />
          <SelectField
            label={label('action')}
            value={(check['actionType'] ?? 'run-tests') as (typeof HOOK_ACTION_TYPES)[number]}
            options={HOOK_ACTION_TYPES}
            onChange={(actionType) => set({ actionType })}
          />
        </>
      )
    case 'gate-exists':
      return (
        <SelectField
          label={label('criterion')}
          value={(check['criterionKind'] ?? 'tests-pass') as (typeof GATE_CRITERION_KINDS)[number]}
          options={GATE_CRITERION_KINDS}
          onChange={(criterionKind) => set({ criterionKind })}
        />
      )
    case 'agent-has-skill-tag':
      return (
        <>
          <TextField
            label={label('tag')}
            value={text('tag')}
            onChange={(tag) => set({ tag })}
            help="A tag one of the agent's skills must carry."
          />
          <RefListField
            label={label('agent')}
            help="Leave empty to accept the tag on any agent."
            selected={text('agentId') ? [text('agentId')] : []}
            options={optionsFor(blueprint, 'agent')}
            onChange={(ids) => set({ agentId: ids.at(-1) })}
          />
        </>
      )
    case 'text-mentions':
      return (
        <>
          <TextField
            label={label('pattern')}
            mono
            value={text('pattern')}
            onChange={(pattern) => set({ pattern })}
          />
          <RefListField
            label={label('kinds')}
            help="Which artifact kinds to search. None chosen means all of them."
            selected={(check['kinds'] ?? []) as string[]}
            options={ENTITY_KINDS.map((kind) => ({
              id: kind,
              name: ENTITY_KIND_INFO[kind].pluralLabel,
            }))}
            onChange={(kinds) => set({ kinds })}
          />
        </>
      )
    case 'ai-judged':
      return (
        <TextAreaField
          label={label('prompt')}
          rows={3}
          value={text('prompt')}
          onChange={(prompt) => set({ prompt })}
          help="Evaluated when an AI endpoint is configured; reported as skipped until then."
        />
      )
  }
}

export function ChecksField({
  entity,
  blueprint,
  update,
}: {
  entity: Record<string, unknown>
  blueprint: Blueprint
  update: (patch: Record<string, unknown>) => void
}) {
  const checks = (entity['checks'] ?? []) as Check[]

  const set = (index: number, patch: Check) => {
    update({
      checks: checks.map((check, position) =>
        position === index ? { ...check, ...patch } : check,
      ),
    })
  }

  return (
    <Field
      label="Checks"
      help="What the validator looks for. Every check that holds moves the requirement towards satisfied."
    >
      <div className="flex flex-col gap-3">
        {checks.map((check, index) => (
          // Keyed by position: checks have no id, and the labels are numbered to match.
          <div key={index} className="flex flex-col gap-2 rounded-md border p-3">
            <SelectField
              label={`Check ${index + 1} type`}
              value={check['type'] as CheckType}
              options={REQUIREMENT_CHECK_TYPES}
              // The old type's fields do not apply to the new one, so they go.
              onChange={(type) =>
                update({
                  checks: checks.map((candidate, position) =>
                    position === index ? { type, ...defaultsFor(type) } : candidate,
                  ),
                })
              }
            />
            <CheckFields
              check={check}
              index={index}
              blueprint={blueprint}
              set={(patch) => set(index, patch)}
            />
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => update({ checks: checks.filter((_, position) => position !== index) })}
            >
              Remove check {index + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            update({
              checks: [...checks, { type: 'iron-law-matches', ...defaultsFor('iron-law-matches') }],
            })
          }
        >
          <PlusIcon className="size-3" />
          Add check
        </Button>
      </div>
    </Field>
  )
}
