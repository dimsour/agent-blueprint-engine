'use client'

/**
 * The project tree: every artifact in the Blueprint, grouped by kind.
 *
 * Counts and diagnostic badges come from the store, so the tree is the fastest place to see
 * that something is wrong and the shortest path to the artifact that is wrong.
 *
 * Every kind is listed, including the empty ones, because an empty kind is information: it
 * is how a designer notices there are no Iron Laws yet, and it is where the button to add
 * the first one lives. Overview sits above them all and is the way back out of a selection.
 */
import {
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  getCollection,
} from '@agent-blueprint/core'
import {
  ChevronRightIcon,
  DownloadIcon,
  GaugeIcon,
  LayersIcon,
  LayoutGridIcon,
  PlusIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ArtifactMenu } from '@/components/tree/artifact-menu'
import { PanelSection } from '@/components/layout/ide-shell'
import { Badge } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { diagnosticsFor, useWorkspace } from '@/lib/state/workspace-store'

/** The sections that are about the Blueprint rather than about one artifact. */
const REPORTS = [
  { id: 'overview' as const, label: 'Overview', icon: LayoutGridIcon },
  { id: 'evaluation' as const, label: 'Evaluation', icon: GaugeIcon },
  { id: 'compatibility' as const, label: 'Compatibility', icon: LayersIcon },
  { id: 'export' as const, label: 'Export', icon: DownloadIcon },
]

export function ProjectTree() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const selection = useWorkspace((state) => state.selection)
  const select = useWorkspace((state) => state.select)
  const create = useWorkspace((state) => state.create)
  const view = useWorkspace((state) => state.view)
  const setView = useWorkspace((state) => state.setView)
  const [collapsed, setCollapsed] = useState<ReadonlySet<EntityKind>>(new Set())

  const groups = useMemo(() => {
    if (!blueprint) return []
    return ENTITY_KINDS.map((kind) => ({
      kind,
      info: ENTITY_KIND_INFO[kind],
      entities: getCollection(blueprint, kind),
    }))
  }, [blueprint])

  if (!blueprint) return null

  const toggle = (kind: EntityKind) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  const addOne = (kind: EntityKind) => {
    const name = `New ${ENTITY_KIND_INFO[kind].label.toLowerCase()}`
    const ref = create(kind, name)
    if (ref) toast.success(`Added ${name}`, { description: 'Rename it from the inspector.' })
  }

  return (
    <PanelSection title="Project">
      <nav aria-label="Blueprint artifacts" className="py-1">
        {REPORTS.map(({ id, label, icon: Icon }) => {
          const active = !selection && view === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                select(undefined)
                setView(id)
              }}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1 text-left text-sm',
                active ? 'bg-accent-muted text-accent' : 'hover:bg-muted',
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </button>
          )
        })}

        <div className="my-1 border-t" />

        {groups.map(({ kind, info, entities }) => {
          const isCollapsed = collapsed.has(kind)
          return (
            <div key={kind}>
              <div className="group/kind flex items-center">
                <button
                  type="button"
                  onClick={() => toggle(kind)}
                  aria-expanded={!isCollapsed}
                  className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-xs font-medium"
                >
                  <ChevronRightIcon
                    className={cn(
                      'size-3 shrink-0 transition-transform',
                      !isCollapsed && 'rotate-90',
                    )}
                  />
                  <span className="flex-1 truncate text-left">{info.pluralLabel}</span>
                  <span className="tabular-nums">{entities.length}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Add ${info.label.toLowerCase()}`}
                  className="mr-1 opacity-0 transition-opacity group-hover/kind:opacity-100 focus-visible:opacity-100"
                  onClick={() => addOne(kind)}
                >
                  <PlusIcon />
                </Button>
              </div>

              {isCollapsed ? null : (
                <ul>
                  {entities.length === 0 ? (
                    <li className="text-muted-foreground px-2 py-1 pl-7 text-xs">None yet.</li>
                  ) : null}
                  {entities.map((entity) => {
                    const own = diagnosticsFor(diagnostics, { kind, id: entity.id })
                    const worst = own.find((diagnostic) => diagnostic.severity === 'error')
                      ? 'danger'
                      : own.find((diagnostic) => diagnostic.severity === 'warning')
                        ? 'warning'
                        : undefined
                    const isSelected = selection?.kind === kind && selection.id === entity.id

                    return (
                      <li key={entity.id} className="group/item flex items-center">
                        <button
                          type="button"
                          onClick={() => select({ kind, id: entity.id })}
                          aria-current={isSelected ? 'true' : undefined}
                          // Named explicitly so the badge's count, which arrives after the
                          // debounced validation, does not silently rename the row.
                          aria-label={
                            own.length > 0 ? `${entity.name}, ${own.length} findings` : entity.name
                          }
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 pl-7 text-left text-sm',
                            isSelected ? 'bg-accent-muted text-accent' : 'hover:bg-muted',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                          {worst ? (
                            <Badge aria-hidden variant={worst} className="px-1 py-0 tabular-nums">
                              {own.length}
                            </Badge>
                          ) : null}
                        </button>
                        <ArtifactMenu
                          artifact={{ kind, id: entity.id, name: entity.name }}
                          className="mr-1 opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100 data-[state=open]:opacity-100"
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </nav>
    </PanelSection>
  )
}
