'use client'

/**
 * The review.
 *
 * Everything a model or a template proposes arrives here first, and nothing reaches the
 * Blueprint until someone accepts it (AGENTS.md rule 6). That makes this the most important
 * screen in the AI feature and the easiest one to get wrong: a review that shows two copies of
 * a page and an Apply button is a rubber stamp with extra steps.
 *
 * So it is per-op and per-field. Each proposal is a row you can accept, reject, or open and
 * edit as the file it would become — the same source view the artifact editor uses, parsed by
 * the same schema, so an edit here cannot produce something the project could not hold. What
 * the operation could not honour is stated above the list rather than left out, because a
 * review the user believes covered everything must actually have covered everything.
 */
import {
  type AnyEntity,
  type Blueprint,
  type ChangeOp,
  type ChangeSet,
  upsertEntity,
} from '@agent-blueprint/core'
import {
  CheckIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { useShortcuts } from '@/lib/shortcuts'

import { Button } from '@/components/ui/button'
import { Badge, Card, Textarea } from '@/components/ui/primitives'
import { parseEntitySource, renderEntitySource } from '@/lib/artifact-source'
import {
  proposedEntity,
  reviewOps,
  withEditedEntity,
  type DiffPart,
  type FieldDiff,
  type ReviewOp,
} from '@/lib/ai/review'

export interface RejectedOp {
  opId: string
  reason: string
}

export function ChangeSetReview({
  changeSet,
  blueprint,
  notes = [],
  contextTrimmed = false,
  busy = false,
  onApply,
  onRegenerate,
  onDismiss,
}: {
  changeSet: ChangeSet
  /** The Blueprint the ops are against, needed to render a proposal as its file. */
  blueprint: Blueprint
  /** What the operation could not honour. */
  notes?: readonly string[]
  contextTrimmed?: boolean
  busy?: boolean
  onApply: (ops: ChangeOp[]) => void
  onRegenerate?: () => void
  onDismiss?: () => void
}) {
  // Everything starts accepted. The alternative — nothing accepted — makes the common case
  // (the proposal is good) into a chore, and the whole list is on screen either way.
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set())
  const [edits, setEdits] = useState<Record<string, AnyEntity>>({})
  const [open, setOpen] = useState<string | undefined>()

  const ops = useMemo(
    () => changeSet.ops.map((op) => (edits[op.id] ? withEditedEntity(op, edits[op.id]!) : op)),
    [changeSet.ops, edits],
  )
  const rows = useMemo(() => reviewOps(ops), [ops])
  const accepted = ops.filter((op) => !rejected.has(op.id))

  // The reserved apply shortcut from docs/07. It acts on what is accepted right now, which is
  // why it lives here rather than with whoever rendered this.
  useShortcuts({
    apply: () => {
      if (busy || accepted.length === 0) return false
      onApply(accepted)
      return true
    },
  })

  const toggle = (id: string) =>
    setRejected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (changeSet.ops.length === 0) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-sm font-medium">Nothing to change</p>
        <p className="text-muted-foreground text-sm">{changeSet.summary}</p>
        <Notes notes={notes} contextTrimmed={contextTrimmed} />
        <div className="flex gap-2">
          {onRegenerate ? (
            <Button variant="outline" onClick={onRegenerate} disabled={busy}>
              <RefreshCwIcon />
              Try again
            </Button>
          ) : null}
          {onDismiss ? (
            <Button variant="ghost" onClick={onDismiss}>
              Close
            </Button>
          ) : null}
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="text-sm">{changeSet.summary}</p>
        <Notes notes={notes} contextTrimmed={contextTrimmed} />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {accepted.length} of {ops.length} accepted
          </span>
          <Button variant="ghost" size="sm" onClick={() => setRejected(new Set())}>
            Accept all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRejected(new Set(ops.map((op) => op.id)))}
          >
            Reject all
          </Button>
        </div>
      </div>

      {/* The panel that hosts this owns the scrolling; a second scroll container here
          leaves rows that look clickable and are not. */}
      <ul aria-label="Proposed changes" className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id}>
            <OpRow
              row={row}
              blueprint={blueprint}
              accepted={!rejected.has(row.id)}
              open={open === row.id}
              onToggle={() => toggle(row.id)}
              onOpen={() => setOpen(open === row.id ? undefined : row.id)}
              onEdit={(entity) => setEdits((current) => ({ ...current, [row.id]: entity }))}
              edited={edits[row.id] !== undefined}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <Button onClick={() => onApply(accepted)} disabled={busy || accepted.length === 0}>
          <CheckIcon />
          Apply {accepted.length} {accepted.length === 1 ? 'change' : 'changes'}
        </Button>
        {onRegenerate ? (
          <Button variant="outline" onClick={onRegenerate} disabled={busy}>
            <RefreshCwIcon />
            Regenerate
          </Button>
        ) : null}
        {onDismiss ? (
          <Button variant="ghost" onClick={onDismiss} disabled={busy}>
            Discard
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function Notes({ notes, contextTrimmed }: { notes: readonly string[]; contextTrimmed: boolean }) {
  if (notes.length === 0 && !contextTrimmed) return null
  return (
    <div className="border-warning/40 bg-warning/5 flex flex-col gap-1 rounded-md border px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <TriangleAlertIcon className="size-3.5" />
        What this could not do
      </span>
      <ul aria-label="Notes" className="text-muted-foreground flex flex-col gap-0.5 text-xs">
        {contextTrimmed ? (
          <li>
            The Blueprint did not fit; some of it was left out, so this was answered on part of the
            picture.
          </li>
        ) : null}
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  )
}

const MARK: Record<ChangeOp['type'], { symbol: string; label: string }> = {
  create: { symbol: '+', label: 'Added' },
  update: { symbol: '~', label: 'Changed' },
  delete: { symbol: '−', label: 'Removed' },
  'update-blueprint': { symbol: '~', label: 'Changed' },
}

function OpRow({
  row,
  blueprint,
  accepted,
  open,
  edited,
  onToggle,
  onOpen,
  onEdit,
}: {
  row: ReviewOp
  blueprint: Blueprint
  accepted: boolean
  open: boolean
  edited: boolean
  onToggle: () => void
  onOpen: () => void
  onEdit: (entity: AnyEntity) => void
}) {
  const mark = MARK[row.op.type]
  return (
    <Card className={accepted ? 'p-3' : 'p-3 opacity-55'}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={accepted}
          aria-label={`${accepted ? 'Reject' : 'Accept'} ${row.title}`}
          onClick={onToggle}
          className="border-input mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border"
        >
          {accepted ? <CheckIcon className="size-3" /> : <MinusIcon className="size-3" />}
        </button>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <span aria-hidden className="text-muted-foreground font-mono text-sm">
              {mark.symbol}
            </span>
            <span className="text-sm font-medium">{row.title}</span>
            <Badge variant="outline">{row.kindLabel}</Badge>
            {edited ? <Badge variant="outline">Edited</Badge> : null}
            <span className="sr-only">{mark.label}</span>
          </span>
          {row.op.note ? (
            <span className="text-muted-foreground mt-1 block text-xs">{row.op.note}</span>
          ) : null}
          <Fields fields={row.fields} />
          {open ? <SourceEditor row={row} blueprint={blueprint} onEdit={onEdit} /> : null}
        </span>
        {proposedEntity(row.op) ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${row.title}`}
            aria-expanded={open}
            onClick={onOpen}
          >
            <PencilIcon />
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

function Fields({ fields }: { fields: readonly FieldDiff[] }) {
  if (fields.length === 0) {
    return <p className="text-muted-foreground mt-1 text-xs">No field differs.</p>
  }
  return (
    <dl className="mt-2 flex flex-col gap-2">
      {fields.map((field) => (
        <div key={field.field} className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
            {field.change === 'added' ? (
              <PlusIcon className="size-3" />
            ) : field.change === 'removed' ? (
              <MinusIcon className="size-3" />
            ) : null}
            {field.field}
          </dt>
          <dd className="bg-muted/50 overflow-x-auto rounded px-2 py-1 font-mono text-xs whitespace-pre-wrap">
            {field.parts.map((part, index) => (
              <Part key={index} part={part} />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Part({ part }: { part: DiffPart }) {
  if (part.added) {
    return (
      <ins className="bg-emerald-500/15 text-emerald-800 no-underline dark:text-emerald-300">
        {part.text}
      </ins>
    )
  }
  if (part.removed) {
    return <del className="bg-red-500/15 text-red-800 dark:text-red-300">{part.text}</del>
  }
  return <span>{part.text}</span>
}

/**
 * The proposal as the file it would become. Rendering and parsing go through the same
 * functions the Source tab uses, so an edit here is subject to the same schema — you cannot
 * hand-edit a proposal into something the project could not hold.
 */
function SourceEditor({
  row,
  blueprint,
  onEdit,
}: {
  row: ReviewOp
  blueprint: Blueprint
  onEdit: (entity: AnyEntity) => void
}) {
  const entity = proposedEntity(row.op)
  const ref = row.ref
  const tentative = useMemo(
    () => (entity && ref ? upsertEntity(blueprint, ref.kind, entity) : blueprint),
    [blueprint, entity, ref],
  )
  const [text, setText] = useState(() => (ref ? renderEntitySource(tentative, ref) : ''))
  const [error, setError] = useState<string | undefined>()

  if (!ref) return null
  return (
    <div className="mt-2 flex flex-col gap-1">
      <Textarea
        aria-label={`Source of ${row.title}`}
        rows={12}
        className="font-mono text-xs"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = parseEntitySource(tentative, ref, event.target.value)
          if (parsed.ok) {
            setError(undefined)
            onEdit(parsed.entity)
          } else {
            setError(parsed.message)
          }
        }}
      />
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Edits are checked as you type; the diff above follows them.
        </p>
      )}
    </div>
  )
}

/** What the store refused to apply, and why. Shown after Apply, never instead of it. */
export function RejectedOps({ rejected }: { rejected: readonly RejectedOp[] }) {
  if (rejected.length === 0) return null
  return (
    <Card className="flex flex-col gap-1 p-3">
      <p className="text-sm font-medium">
        {rejected.length} {rejected.length === 1 ? 'change was' : 'changes were'} not applied
      </p>
      <ul
        aria-label="Rejected changes"
        className="text-muted-foreground flex flex-col gap-0.5 text-xs"
      >
        {rejected.map((entry) => (
          <li key={entry.opId}>
            <span className="font-mono">{entry.opId}</span> — {entry.reason}
          </li>
        ))}
      </ul>
    </Card>
  )
}
