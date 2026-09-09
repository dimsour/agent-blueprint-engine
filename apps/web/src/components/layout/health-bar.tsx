'use client'

/**
 * The health bar: the one line that says whether this Blueprint is in good shape.
 *
 * Every number here is clickable in spirit: the counts come from the same diagnostics the
 * panels show, so the bar can never disagree with the artifact it points at. Wiring the
 * clicks to a diagnostics panel is roadmap P5.
 */
import { AlertTriangleIcon, CircleAlertIcon, InfoIcon, LoaderIcon } from 'lucide-react'
import { useMemo } from 'react'

import { countEntities, evaluateBlueprint, summarizeDiagnostics } from '@agent-blueprint/core'
import { useWorkspace } from '@/lib/state/workspace-store'

export function HealthBar() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const validating = useWorkspace((state) => state.validating)

  const counts = useMemo(() => summarizeDiagnostics(diagnostics), [diagnostics])
  // Scoring walks the whole Blueprint, so it is recomputed only when the Blueprint changes.
  const score = useMemo(
    () => (blueprint ? evaluateBlueprint(blueprint, { diagnostics }).overall : undefined),
    [blueprint, diagnostics],
  )

  if (!blueprint) return null

  return (
    <>
      <span className="font-medium">{countEntities(blueprint)} artifacts</span>

      <span className="flex items-center gap-1" title={`${counts.errors} errors`}>
        <CircleAlertIcon className={counts.errors > 0 ? 'text-danger size-3.5' : 'size-3.5'} />
        {counts.errors}
      </span>
      <span className="flex items-center gap-1" title={`${counts.warnings} warnings`}>
        <AlertTriangleIcon className={counts.warnings > 0 ? 'text-warning size-3.5' : 'size-3.5'} />
        {counts.warnings}
      </span>
      <span className="flex items-center gap-1" title={`${counts.infos} suggestions`}>
        <InfoIcon className="size-3.5" />
        {counts.infos}
      </span>

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
            <span key={target.harnessId} className="flex items-center gap-1">
              <span
                aria-hidden
                className={
                  counts.errors > 0
                    ? 'bg-danger size-2 rounded-full'
                    : 'bg-success size-2 rounded-full'
                }
              />
              {target.harnessId}
            </span>
          ))}
        <span className="font-medium">
          Health{' '}
          <span className={score !== undefined && score < 70 ? 'text-warning' : ''}>
            {score ?? '—'}
          </span>
        </span>
      </span>
    </>
  )
}
