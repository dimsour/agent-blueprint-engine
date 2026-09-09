'use client'

/**
 * How good is this Blueprint, and why.
 *
 * The score is not an opinion the app is offering: every point comes off for a finding that
 * is named right next to it, and every requirement result comes with the artifacts that
 * satisfied it. A number without its reasons would be worse than no number.
 */
import {
  evaluateBlueprint,
  type EntityRef,
  ENTITY_KIND_INFO,
  type RequirementResult,
} from '@agent-blueprint/core'
import { portabilityProvider } from '@agent-blueprint/exporters'
import { CheckIcon, CircleAlertIcon, MinusIcon, RefreshCwIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'

import { validateNow } from '@/lib/actions'
import { DiagnosticRow } from '@/components/views/diagnostic-row'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/state/workspace-store'

function scoreTone(score: number): string {
  if (score >= 85) return 'text-success'
  if (score >= 70) return 'text-warning'
  return 'text-danger'
}

const STATUS_ICON: Record<RequirementResult['status'], React.ReactNode> = {
  satisfied: <CheckIcon className="text-success size-3.5" />,
  partial: <CircleAlertIcon className="text-warning size-3.5" />,
  unsatisfied: <XIcon className="text-danger size-3.5" />,
  // A check that needs a model cannot run yet, which is not the same as failing.
  unverifiable: <MinusIcon className="text-muted-foreground size-3.5" />,
}

export function EvaluationView() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const diagnostics = useWorkspace((state) => state.diagnostics)
  const validating = useWorkspace((state) => state.validating)
  const select = useWorkspace((state) => state.select)

  // Always the store's diagnostics. "Run again" refreshes those rather than computing a
  // second, private set, so this view and the health bar can never describe different runs.
  const report = useMemo(
    () =>
      blueprint
        ? evaluateBlueprint(blueprint, { diagnostics, portability: portabilityProvider() })
        : undefined,
    [blueprint, diagnostics],
  )

  if (!blueprint || !report) return null

  const goTo = (ref: EntityRef | undefined, nodeId: string | undefined) => {
    if (ref) select(ref, nodeId ? { nodeId } : {})
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-4">
        <span className={cn('text-4xl font-semibold tabular-nums', scoreTone(report.overall))}>
          {report.overall}
        </span>
        <span className="text-muted-foreground flex-1 text-sm">
          A weighted mean of the dimensions below. Every point lost has a finding behind it.
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={validating}
          onClick={() => void validateNow()}
        >
          <RefreshCwIcon className={cn('size-3', validating && 'animate-spin')} />
          Run again
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Dimensions</h2>
        <ul aria-label="Dimension scores" className="flex flex-col gap-2">
          {report.dimensions.map((dimension) => (
            <li key={dimension.id}>
              <Card className="flex flex-col gap-2 p-3">
                <span className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm font-medium">{dimension.label}</span>
                  <span className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className={cn(
                        'block h-full',
                        dimension.score >= 85
                          ? 'bg-success'
                          : dimension.score >= 70
                            ? 'bg-warning'
                            : 'bg-danger',
                      )}
                      style={{ width: `${dimension.score}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums">
                    {dimension.score}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    ×{dimension.weight}
                  </Badge>
                </span>

                {dimension.findings.length > 0 ? (
                  <ul
                    aria-label={`${dimension.label} findings`}
                    className="flex flex-col gap-1 border-t pt-2"
                  >
                    {dimension.findings.map((finding, index) => (
                      <li key={`${finding.code}-${index}`}>
                        <DiagnosticRow diagnostic={finding} onNavigate={goTo} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Requirements</h2>
        {report.requirements.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No requirements yet. They are how &ldquo;this Blueprint does what I asked&rdquo; becomes
            something the app can check rather than assert.
          </p>
        ) : (
          <ul aria-label="Requirement results" className="flex flex-col gap-2">
            {report.requirements.map((result) => {
              const requirement = blueprint.requirements.find(
                (candidate) => candidate.id === result.ref.id,
              )
              return (
                <li key={result.ref.id}>
                  <Card className="flex flex-col gap-2 p-3">
                    <span className="flex items-center gap-2">
                      {STATUS_ICON[result.status]}
                      <button
                        type="button"
                        onClick={() => select(result.ref)}
                        className="min-w-0 flex-1 text-left text-sm font-medium hover:underline"
                      >
                        {requirement?.statement ?? result.ref.id}
                      </button>
                      {requirement ? <Badge variant="outline">{requirement.level}</Badge> : null}
                    </span>

                    <ul aria-label="Checks" className="flex flex-col gap-1">
                      {result.checks.map((check, index) => (
                        <li key={index} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                          <Badge
                            variant={
                              check.status === 'pass'
                                ? 'success'
                                : check.status === 'fail'
                                  ? 'danger'
                                  : 'outline'
                            }
                          >
                            {check.status}
                          </Badge>
                          <span className="font-mono">{check.check.type}</span>
                          {check.error ? <span className="text-danger">{check.error}</span> : null}
                          {check.evidence.map((ref) => (
                            <button
                              key={`${ref.kind}:${ref.id}`}
                              type="button"
                              onClick={() => select(ref)}
                              className="hover:border-accent rounded border px-1.5 py-0.5"
                            >
                              {ENTITY_KIND_INFO[ref.kind].label}: {ref.id}
                            </button>
                          ))}
                        </li>
                      ))}
                      {result.checks.length === 0 ? (
                        <li className="text-muted-foreground text-xs">
                          No checks, so nothing can confirm it. Add one from the requirement.
                        </li>
                      ) : null}
                    </ul>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground text-xs">
        Computed from schema {report.computedFrom.schemaVersion} with rules{' '}
        {report.computedFrom.rulesVersion}. The report is a value, never stored in the project.
      </p>
    </div>
  )
}
