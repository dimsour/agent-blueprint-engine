'use client'

/**
 * The health bar: the one line that says whether this Blueprint is in good shape.
 *
 * Every number here opens the findings behind it, so every number has to come from the same
 * place those findings do. One report is computed and `healthSummary` reads the counts, the
 * score and the per-target status off it, which is what stops the bar from showing three
 * clean zeroes beside a score that a dozen findings pulled down.
 */
import {
  type Diagnostic,
  evaluateBlueprint,
  healthSummary,
  type TargetStatus,
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
import { useWorkspace } from '@/lib/state/workspace-store'

type Severity = Diagnostic['severity']

/** What a target's status means, said in words rather than only in the colour of a dot. */
const TARGET_STATUS: Record<TargetStatus, { label: string; dot: string }> = {
  ok: { label: 'compiles cleanly', dot: 'bg-success' },
  adapted: { label: 'compiles, with some concepts adapted', dot: 'bg-muted-foreground' },
  limited: { label: 'compiles, with some concepts limited', dot: 'bg-warning' },
  blocked: { label: 'blocked by an error', dot: 'bg-danger' },
}

export function HealthBar() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const validating = useWorkspace((state) => state.validating)
  const select = useWorkspace((state) => state.select)
  const setView = useWorkspace((state) => state.setView)
  const [open, setOpen] = useState<Severity | undefined>()

  const report = useMemo(
    () =>
      blueprint
        ? evaluateBlueprint(blueprint, { diagnostics, portability: portabilityProvider() })
        : undefined,
    [blueprint, diagnostics],
  )
  const summary = useMemo(
    () => (blueprint && report ? healthSummary(blueprint, report) : undefined),
    [blueprint, report],
  )

  const listed = useMemo(
    () =>
      open ? (report?.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === open) : [],
    [report, open],
  )

  if (!blueprint || !summary) return null

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

      <span className="font-medium">{summary.artifacts} artifacts</span>

      {counter(
        'error',
        summary.errors,
        <CircleAlertIcon className={summary.errors > 0 ? 'text-danger size-3.5' : 'size-3.5'} />,
        'errors',
      )}
      {counter(
        'warning',
        summary.warnings,
        <AlertTriangleIcon
          className={summary.warnings > 0 ? 'text-warning size-3.5' : 'size-3.5'}
        />,
        'warnings',
      )}
      {counter('info', summary.infos, <InfoIcon className="size-3.5" />, 'suggestions')}

      {summary.errors + summary.warnings + summary.infos > 0 ? (
        <ChevronUpIcon className={cn('size-3', open && 'rotate-180')} aria-hidden />
      ) : null}

      {validating ? (
        <span className="flex items-center gap-1">
          <LoaderIcon className="size-3.5 animate-spin" />
          Checking
        </span>
      ) : null}

      <span className="ml-auto flex items-center gap-3">
        {summary.targets.map((target) => (
          <button
            key={target.harnessId}
            type="button"
            // The status is part of the name, not only the colour of the dot.
            aria-label={`${target.harnessId}: ${TARGET_STATUS[target.status].label}`}
            title={TARGET_STATUS[target.status].label}
            onClick={() => {
              select(undefined)
              setView('compatibility')
            }}
            className="hover:bg-muted flex items-center gap-1 rounded px-1"
          >
            <span
              aria-hidden
              className={cn('size-2 rounded-full', TARGET_STATUS[target.status].dot)}
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
          <span className={summary.overall < 70 ? 'text-warning' : ''}>{summary.overall}</span>
        </button>
      </span>
    </>
  )
}
