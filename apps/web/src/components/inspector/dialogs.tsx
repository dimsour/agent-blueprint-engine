'use client'

/**
 * The three dialogs behind the inspector's quick actions.
 *
 * Rename and delete are refactors, not edits: one rewrites every reference to an artifact,
 * the other removes them. Both show what they are about to touch before they touch it, which
 * is the whole reason the dependency graph exists. Adding from a template shows the change it
 * proposes for the same reason, and applies it as a ChangeSet so nothing reaches the
 * Blueprint that the user has not seen.
 */
import {
  type Blueprint,
  buildDependencyGraph,
  ENTITY_KIND_INFO,
  type EntityKind,
  type EntityRef,
  impactOf,
  getCollection,
  slugify,
  uniqueSlug,
} from '@agent-blueprint/core'
import { templatesForKind } from '@agent-blueprint/templates/artifacts'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays'
import { Badge, Input, Label } from '@/components/ui/primitives'
import { entityOf } from '@/lib/artifact-source'
import { relationsOf } from '@/lib/relations'
import { useWorkspace } from '@/lib/state/workspace-store'

interface DialogProps {
  selection: EntityRef
  open: boolean
  onOpenChange: (open: boolean) => void
}

function kindLabel(kind: EntityKind): string {
  return ENTITY_KIND_INFO[kind].label.toLowerCase()
}

/** An artifact's display name, falling back to its id when it has already gone. */
function nameOf(blueprint: Blueprint, ref: EntityRef): string {
  return entityOf(blueprint, ref)?.name ?? ref.id
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export function RenameDialog({ selection, open, onOpenChange }: DialogProps) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const rename = useWorkspace((state) => state.rename)
  const [draft, setDraft] = useState(selection.id)
  const [error, setError] = useState<string | undefined>()
  const fieldId = useId()

  const dependents = useMemo(
    () => (blueprint ? relationsOf(blueprint, selection).dependents.length : 0),
    [blueprint, selection],
  )

  const submit = () => {
    if (draft === selection.id) {
      onOpenChange(false)
      return
    }
    try {
      rename(selection.kind, selection.id, draft)
      toast.success(`Renamed to ${draft}`, { description: 'Every reference to it was updated.' })
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Rename this {kindLabel(selection.kind)}</DialogTitle>
          <DialogDescription>
            The id is the file name and the key every other artifact refers to.{' '}
            {dependents === 0
              ? 'Nothing else refers to this one yet.'
              : `${dependents} artifact${dependents === 1 ? '' : 's'} will be updated to match.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId}>New id</Label>
          <Input
            id={fieldId}
            value={draft}
            autoFocus
            className="font-mono"
            onChange={(event) => {
              setDraft(event.target.value)
              setError(undefined)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
          {error ? (
            <p role="alert" className="text-danger text-xs">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function DeleteDialog({ selection, open, onOpenChange }: DialogProps) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const remove = useWorkspace((state) => state.remove)
  const select = useWorkspace((state) => state.select)

  const relations = useMemo(
    () => (blueprint ? relationsOf(blueprint, selection) : undefined),
    [blueprint, selection],
  )
  // The graph's own impact report, which reaches past the artifacts that point at this one
  // to the artifacts that point at those. A delete propagates that far.
  const impact = useMemo(
    () => (blueprint ? impactOf(buildDependencyGraph(blueprint), selection) : undefined),
    [blueprint, selection],
  )
  const entity = blueprint ? entityOf(blueprint, selection) : undefined

  if (!relations || !impact || !entity || !blueprint) return null

  const dependents = relations.dependents
  const indirect = impact.transitive.filter(
    (ref) => !impact.direct.some((direct) => direct.kind === ref.kind && direct.id === ref.id),
  )
  const targets = blueprint.targets.filter((target) => target.enabled)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Delete “{entity.name}”?</DialogTitle>
          <DialogDescription>
            {dependents.length === 0
              ? 'Nothing refers to this artifact, so deleting it affects nothing else.'
              : `${dependents.length} artifact${
                  dependents.length === 1 ? '' : 's'
                } refer to it. The references are removed too.`}
          </DialogDescription>
        </DialogHeader>

        {relations.isPrimaryAgent ? (
          <p role="alert" className="border-danger text-danger rounded-md border px-3 py-2 text-xs">
            This is the Blueprint&rsquo;s primary agent. Without one, nothing compiles to a root
            instruction file until another agent is made primary.
          </p>
        ) : null}

        {dependents.length > 0 ? (
          <ul
            aria-label="Affected artifacts"
            className="flex max-h-40 flex-col gap-1 overflow-auto"
          >
            {dependents.map((related) => (
              <li
                key={`${related.ref.kind}:${related.ref.id}`}
                className="flex items-center gap-2 text-sm"
              >
                <Badge variant="outline" className="shrink-0">
                  {ENTITY_KIND_INFO[related.ref.kind].label}
                </Badge>
                <span className="truncate">{related.name}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {indirect.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              And {indirect.length} further along the chain:
            </span>
            <ul aria-label="Affected further along" className="flex flex-wrap gap-1">
              {indirect.map((ref) => (
                <li key={`${ref.kind}:${ref.id}`}>
                  <Badge variant="outline">{nameOf(blueprint, ref)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {targets.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            Compiled output changes for {targets.map((target) => target.harnessId).join(' and ')}.
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              remove(selection)
              select(undefined)
              onOpenChange(false)
              toast.success(`Deleted ${entity.name}`, { description: 'Undo with Ctrl+Z.' })
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// New from template
// ---------------------------------------------------------------------------

export function TemplateDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: EntityKind
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const apply = useWorkspace((state) => state.apply)
  const select = useWorkspace((state) => state.select)
  const templates = useMemo(() => templatesForKind(kind), [kind])
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [name, setName] = useState('')
  const nameFieldId = useId()

  const template = templates.find((candidate) => candidate.id === templateId)
  const taken = blueprint ? getCollection(blueprint, kind).map((entity) => entity.id) : []
  const id = name.trim() ? uniqueSlug(name, taken) : ''
  const changeSet = template && id ? template.build({ id, name: name.trim() }) : undefined

  if (templates.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>No templates for {ENTITY_KIND_INFO[kind].pluralLabel}</DialogTitle>
            <DialogDescription>
              This kind has no starting points yet. Create one from the tree and fill it in.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>New {kindLabel(kind)} from a template</DialogTitle>
          <DialogDescription>
            A template proposes a change; nothing is added until you accept it.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Template</legend>
          <div className="flex max-h-56 flex-col gap-1 overflow-auto pt-1">
            {templates.map((candidate) => (
              <label
                key={candidate.id}
                className="hover:bg-muted flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5"
              >
                <input
                  type="radio"
                  name="template"
                  value={candidate.id}
                  checked={candidate.id === templateId}
                  onChange={() => setTemplateId(candidate.id)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{candidate.label}</span>
                  <span className="text-muted-foreground block text-xs">
                    {candidate.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameFieldId}>Name</Label>
          <Input
            id={nameFieldId}
            value={name}
            placeholder={`New ${kindLabel(kind)}`}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {id ? (
              <>
                Id: <span className="font-mono">{id}</span>
              </>
            ) : (
              'The id is derived from the name.'
            )}
          </p>
        </div>

        {changeSet ? (
          <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
            {changeSet.summary}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!changeSet}
            onClick={() => {
              if (!changeSet) return
              apply(changeSet)
              select({ kind, id })
              onOpenChange(false)
              toast.success(`Added ${name.trim()}`, { description: changeSet.summary })
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The id a duplicate would get, exported so the button can name it and a test can assert it. */
export function duplicateIdFor(taken: readonly string[], id: string): string {
  return uniqueSlug(`${slugify(id)}-copy`, taken)
}
