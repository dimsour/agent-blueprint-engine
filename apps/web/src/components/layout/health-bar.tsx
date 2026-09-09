'use client'

/**
 * The health bar: the one line that says whether this Blueprint is in good shape.
 *
 * Every number here opens the findings behind it. A count nobody can act on is decoration,
 * and the whole point of computing diagnostics against a model is that each one knows which
 * artifact it is about, down to the step inside a workflow.
 */
import {
  countEntities,
  type Diagnostic,
  evaluateBlueprint,
  summarizeDiagnostics,
} from '@agent-blueprint/core'
import { portabilityProvider } from '@agent-blueprint/exporters'
import {
  AlertTriangleIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  InfoIcon,
  LoaderIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { DiagnosticRow } from '@/components/views/diagnostic-row'
import { cn } from '@/lib/utils'
import { enabledTargetIds } from '@/lib/wizard/draft'
import { useWorkspace } from '@/lib/state/workspace-store'

type Severity = Diagnostic['severity']

export function HealthBar() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const validating = useWorkspace((state) => state.validating)
  const select = useWorkspace((state) => state.select)
  const setView = useWorkspace((state) => state.setView)
  const [open, setOpen] = useState<Severity | undefined>()

  const counts = useMemo(() => summarizeDiagnostics(diagnostics), [diagnostics])
  // Scoring walks the whole Blueprint, so it is recomputed only when the Blueprint changes.
  const score = useMemo(
    () =>
      blueprint
        ? evaluateBlueprint(blueprint, {
            diagnostics,
            portability: portabilityProvider({ targets: enabledTargetIds(blueprint) }),
          }).overall
        : undefined,
    [blueprint, diagnostics],
  )

  const listed = useMemo(
    () => (open ? diagnostics.filter((diagnostic) => diagnostic.severity === open) : []),
    [diagnostics, open],
  )

  if (!blueprint) return null

  const toggle = (severity: Severity) =>
    setOpen((current) => (current === severity ? undefined : severity))

  const counter = (severity: Severity, count: number, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      aria-expanded={open === severity}
      aria-label={`${count} ${label}`}
      disabled={count === 0}
      onClick={() => toggle(severity)}
      className={cn(
        'flex items-center gap-1 rounded px-1',
        count > 0 ? 'hover:bg-muted' : 'opacity-60',
        open === severity && 'bg-muted',
      )}
    >
      {icon}
      <span className="tabular-nums">{count}</span>
    </button>
  )

  return (
    <>
      {open ? (
        // Above the bar rather than inside it: the bar is one line and must stay one line.
        <div className="bg-surface absolute inset-x-0 bottom-7 z-20 max-h-72 overflow-auto border-t shadow-lg">
          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <span className="text-xs font-medium">
              {listed.length} {open}
              {listed.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(undefined)}
              className="text-muted-foreground hover:text-foreground ml-auto text-xs"
            >
              Close
            </button>
          </div>
          <ul aria-label={`${open} findings`} className="flex flex-col p-1">
            {listed.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>
                <DiagnosticRow
                  diagnostic={diagnostic}
                  onNavigate={(ref, nodeId) => {
                    if (!ref) return
                    select(ref, nodeId ? { nodeId } : {})
                    setOpen(undefined)
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <span className="font-medium">{countEntities(blueprint)} artifacts</span>

      {counter(
        'error',
        counts.errors,
        <CircleAlertIcon className={counts.errors > 0 ? 'text-danger size-3.5' : 'size-3.5'} />,
        'errors',
      )}
      {counter(
        'warning',
        counts.warnings,
        <AlertTriangleIcon
          className={counts.warnings > 0 ? 'text-warning size-3.5' : 'size-3.5'}
        />,
        'warnings',
      )}
      {counter('info', counts.infos, <InfoIcon className="size-3.5" />, 'suggestions')}

      {counts.errors + counts.warnings + counts.infos > 0 ? (
        <ChevronUpIcon className={cn('size-3', open && 'rotate-180')} aria-hidden />
      ) : null}

      {validating ? (
        <span className="flex items-center gap-1">
          <LoaderIcon className="size-3.5 animate-spin" />
          Checking
        </span>
      ) : null}

      <span className="ml-auto flex items-center gap-3">
        {blueprint.targets
          .filter((target) => target.enabled)
          .map((target) => (
            <button
              key={target.harnessId}
              type="button"
              onClick={() => {
                select(undefined)
                setView('compatibility')
              }}
              className="hover:bg-muted flex items-center gap-1 rounded px-1"
            >
              <span
                aria-hidden
                className={
                  counts.errors > 0
                    ? 'bg-danger size-2 rounded-full'
                    : 'bg-success size-2 rounded-full'
                }
              />
              {target.harnessId}
            </button>
          ))}
        <button
          type="button"
          onClick={() => {
            select(undefined)
            setView('evaluation')
          }}
          className="hover:bg-muted rounded px-1 font-medium"
        >
          Health{' '}
          <span className={score !== undefined && score < 70 ? 'text-warning' : ''}>
            {score ?? '—'}
          </span>
        </button>
      </span>
    </>
  )
}
