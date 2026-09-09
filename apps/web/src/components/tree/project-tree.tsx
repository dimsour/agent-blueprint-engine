'use client'

/**
 * The project tree: every artifact in the Blueprint, grouped by kind.
 *
 * Counts and diagnostic badges come from the store, so the tree is the fastest place to see
 * that something is wrong and the shortest path to the artifact that is wrong.
 */
import {
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  getCollection,
} from '@agent-blueprint/core'
import { ChevronRightIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PanelSection } from '@/components/layout/ide-shell'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { diagnosticsFor, useWorkspace } from '@/lib/state/workspace-store'

export function ProjectTree() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const selection = useWorkspace((state) => state.selection)
  const select = useWorkspace((state) => state.select)
  const [collapsed, setCollapsed] = useState<ReadonlySet<EntityKind>>(new Set())

  const groups = useMemo(() => {
    if (!blueprint) return []
    return ENTITY_KINDS.map((kind) => ({
      kind,
      info: ENTITY_KIND_INFO[kind],
      entities: getCollection(blueprint, kind),
    })).filter((group) => group.entities.length > 0)
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

  return (
    <PanelSection title="Project">
      <nav aria-label="Blueprint artifacts" className="py-1">
        {groups.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-xs">
            This Blueprint is empty. Add an agent to begin.
          </p>
        ) : null}

        {groups.map(({ kind, info, entities }) => {
          const isCollapsed = collapsed.has(kind)
          return (
            <div key={kind}>
              <button
                type="button"
                onClick={() => toggle(kind)}
                aria-expanded={!isCollapsed}
                className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-2 py-1 text-xs font-medium"
              >
                <ChevronRightIcon
                  className={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')}
                />
                <span className="flex-1 text-left">{info.pluralLabel}</span>
                <span className="tabular-nums">{entities.length}</span>
              </button>

              {isCollapsed ? null : (
                <ul>
                  {entities.map((entity) => {
                    const own = diagnosticsFor(diagnostics, { kind, id: entity.id })
                    const worst = own.find((diagnostic) => diagnostic.severity === 'error')
                      ? 'danger'
                      : own.find((diagnostic) => diagnostic.severity === 'warning')
                        ? 'warning'
                        : undefined
                    const isSelected = selection?.kind === kind && selection.id === entity.id

                    return (
                      <li key={entity.id}>
                        <button
                          type="button"
                          onClick={() => select({ kind, id: entity.id })}
                          aria-current={isSelected ? 'true' : undefined}
                          className={cn(
                            'flex w-full items-center gap-2 py-1 pr-2 pl-7 text-left text-sm',
                            isSelected ? 'bg-accent-muted text-accent' : 'hover:bg-muted',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                          {worst ? (
                            <Badge variant={worst} className="px-1 py-0 tabular-nums">
                              {own.length}
                            </Badge>
                          ) : null}
                        </button>
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
