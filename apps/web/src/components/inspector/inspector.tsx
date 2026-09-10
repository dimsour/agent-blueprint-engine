'use client'

/**
 * The inspector: what the selected artifact is, what it depends on, what depends on it, and
 * what is wrong with it.
 *
 * The two relation lists are the panel's reason to exist. A Blueprint is a graph, and the
 * question a designer asks constantly is "what breaks if I change this" — so the answer sits
 * next to the actions that would change it, and every entry navigates to the artifact it
 * names.
 */
import {
  type Diagnostic,
  ENTITY_KIND_INFO,
  type EntityRef,
  getCollection,
} from '@agent-blueprint/core'
import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  DeleteDialog,
  duplicateIdFor,
  RenameDialog,
  TemplateDialog,
} from '@/components/inspector/dialogs'
import { PanelSection } from '@/components/layout/ide-shell'
import { DiagnosticHelp, SeverityIcon } from '@/components/views/diagnostic-row'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { entityOf } from '@/lib/artifact-source'
import { type RelatedArtifact, relationsOf } from '@/lib/relations'
import { diagnosticsFor, useWorkspace } from '@/lib/state/workspace-store'
import { cn } from '@/lib/utils'

type OpenDialog = 'rename' | 'delete' | 'template' | undefined

export function Inspector() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const selection = useWorkspace((state) => state.selection)

  if (!blueprint) return null
  if (!selection) return <AllFindings />

  // Keyed so the dialogs' drafts reset when a different artifact is selected.
  return <ArtifactInspector key={`${selection.kind}:${selection.id}`} selection={selection} />
}

function ArtifactInspector({ selection }: { selection: EntityRef }) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const upsert = useWorkspace((state) => state.upsert)
  const select = useWorkspace((state) => state.select)
  const [dialog, setDialog] = useState<OpenDialog>()

  const relations = useMemo(
    () => (blueprint ? relationsOf(blueprint, selection) : undefined),
    [blueprint, selection],
  )
  const own = useMemo(() => diagnosticsFor(diagnostics, selection), [diagnostics, selection])

  const entity = blueprint ? entityOf(blueprint, selection) : undefined

  if (!blueprint || !entity || !relations) {
    return (
      <PanelSection title="Inspector">
        <p className="text-muted-foreground p-3 text-sm">That artifact no longer exists.</p>
      </PanelSection>
    )
  }

  const duplicate = () => {
    const taken = getCollection(blueprint, selection.kind).map((item) => item.id)
    const id = duplicateIdFor(taken, selection.id)
    upsert(selection.kind, {
      ...(entity as unknown as Record<string, unknown>),
      id,
      name: `${entity.name} (copy)`,
    } as never)
    select({ kind: selection.kind, id })
    toast.success(`Duplicated as ${id}`, {
      description: 'It points at what the original pointed at; nothing points at it yet.',
    })
  }

  return (
    <PanelSection title="Inspector">
      <div className="flex flex-col gap-4 p-3">
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <Badge variant="accent">{ENTITY_KIND_INFO[selection.kind].label}</Badge>
            {relations.isPrimaryAgent ? <Badge variant="success">Primary</Badge> : null}
          </span>
          <h2 className="text-sm leading-tight font-semibold">{entity.name}</h2>
          <p className="text-muted-foreground font-mono text-xs">{entity.id}</p>
          {entity.description ? (
            <p className="text-muted-foreground text-xs">{entity.description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setDialog('rename')}>
            <PencilIcon className="size-3" />
            Rename…
          </Button>
          <Button variant="outline" size="sm" onClick={duplicate}>
            <CopyIcon className="size-3" />
            Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialog('template')}>
            <PlusIcon className="size-3" />
            New from template
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialog('delete')}>
            <Trash2Icon className="text-danger size-3" />
            Delete
          </Button>
        </div>

        <RelationList
          title="Depends on"
          empty="This artifact refers to nothing else."
          items={relations.dependencies}
        />
        <RelationList
          title="Used by"
          empty="Nothing refers to this artifact."
          items={relations.dependents}
        />

        <section className="flex flex-col gap-2">
          <SectionTitle>Findings</SectionTitle>
          {own.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing to report for this artifact.</p>
          ) : (
            own.map((diagnostic, index) => (
              <DiagnosticCard key={`${diagnostic.code}-${index}`} diagnostic={diagnostic} />
            ))
          )}
        </section>
      </div>

      {dialog === 'rename' ? (
        <RenameDialog selection={selection} open onOpenChange={() => setDialog(undefined)} />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDialog selection={selection} open onOpenChange={() => setDialog(undefined)} />
      ) : null}
      {dialog === 'template' ? (
        <TemplateDialog kind={selection.kind} open onOpenChange={() => setDialog(undefined)} />
      ) : null}
    </PanelSection>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      {children}
    </h3>
  )
}

function RelationList({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: readonly RelatedArtifact[]
}) {
  const select = useWorkspace((state) => state.select)

  return (
    <section className="flex flex-col gap-1.5">
      <SectionTitle>
        {title}
        {items.length > 0 ? <span className="ml-1 tabular-nums">{items.length}</span> : null}
      </SectionTitle>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul aria-label={title} className="flex flex-col">
          {items.map((item) => (
            <li key={`${item.ref.kind}:${item.ref.id}`}>
              <button
                type="button"
                disabled={item.missing}
                onClick={() => select(item.ref)}
                className="hover:bg-muted flex w-full items-baseline gap-2 rounded px-1 py-1 text-left disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span className="text-muted-foreground w-24 shrink-0 truncate text-xs">
                  {item.phrase}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                {item.missing ? (
                  <Badge variant="danger" className="shrink-0">
                    missing
                  </Badge>
                ) : (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {ENTITY_KIND_INFO[item.ref.kind].label}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AllFindings() {
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const select = useWorkspace((state) => state.select)
  const shown = diagnostics.slice(0, 20)

  return (
    <PanelSection title="All findings">
      <div className="flex flex-col gap-2 p-3">
        {shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">No findings. This Blueprint is clean.</p>
        ) : (
          shown.map((diagnostic, index) => (
            <DiagnosticCard
              key={`${diagnostic.code}-${index}`}
              diagnostic={diagnostic}
              onNavigate={diagnostic.ref ? () => select(diagnostic.ref) : undefined}
            />
          ))
        )}
      </div>
    </PanelSection>
  )
}

function DiagnosticCard({
  diagnostic,
  onNavigate,
}: {
  diagnostic: Diagnostic
  onNavigate?: (() => void) | undefined
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <SeverityIcon severity={diagnostic.severity} />
        <Badge variant="outline" className="font-mono">
          {diagnostic.code}
        </Badge>
      </span>
      <span className="text-sm">{diagnostic.message}</span>
    </>
  )

  // The card is the whole target when it navigates, so the help control cannot sit inside it:
  // a button inside a button is not a thing the browser can render. It goes beside it, in a
  // wrapping row of its own, which is also where its panel unfolds.
  return (
    <Card className={cn('p-0', onNavigate && 'hover:bg-muted')}>
      <div className="flex flex-wrap items-start gap-x-1 p-2.5">
        {onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 flex-col gap-1 text-left"
          >
            {body}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-1">{body}</span>
        )}
        <DiagnosticHelp code={diagnostic.code} />
      </div>
    </Card>
  )
}
