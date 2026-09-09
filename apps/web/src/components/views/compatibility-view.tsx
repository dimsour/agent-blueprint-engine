'use client'

/**
 * What survives the trip to each harness.
 *
 * "Compile everywhere" is the promise, and this is where the app keeps it honest. The matrix
 * is filtered to the concepts this Blueprint actually uses, because a warning about hooks in
 * a Blueprint with no hooks is noise, and every cell that is less than native says what the
 * harness does instead.
 */
import { HARNESS_IDS, HARNESS_LABELS, type HarnessId } from '@agent-blueprint/core'
import { adapterFor, portabilityOf } from '@agent-blueprint/exporters'
import { CheckIcon, CircleSlashIcon, TriangleAlertIcon, WrenchIcon } from 'lucide-react'
import { useMemo } from 'react'

import { Badge, Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/state/workspace-store'

type Support = 'native' | 'adapted' | 'limited' | 'unsupported'

const SUPPORT: Record<Support, { icon: React.ReactNode; label: string; tone: string }> = {
  native: {
    icon: <CheckIcon className="size-3.5" />,
    label: 'Native',
    tone: 'text-success',
  },
  adapted: {
    icon: <WrenchIcon className="size-3.5" />,
    label: 'Adapted',
    tone: 'text-muted-foreground',
  },
  limited: {
    icon: <TriangleAlertIcon className="size-3.5" />,
    label: 'Limited',
    tone: 'text-warning',
  },
  unsupported: {
    icon: <CircleSlashIcon className="size-3.5" />,
    label: 'Unsupported',
    tone: 'text-danger',
  },
}

/** Concept names read better as sentences than as identifiers. */
function conceptLabel(concept: string): string {
  return concept
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase())
}

export function CompatibilityView() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const updateBlueprint = useWorkspace((state) => state.updateBlueprint)

  const enabled = useMemo(
    () => (blueprint ? blueprint.targets.filter((t) => t.enabled).map((t) => t.harnessId) : []),
    [blueprint],
  )

  const result = useMemo(() => (blueprint ? portabilityOf(blueprint) : undefined), [blueprint])

  if (!blueprint || !result) return null

  const used = result.matrix.filter((row) => row.used)

  const toggle = (harnessId: HarnessId) => {
    const on = enabled.includes(harnessId)
    const next = on
      ? blueprint.targets.filter((target) => target.harnessId !== harnessId)
      : [...blueprint.targets, { harnessId, enabled: true, options: {} }]
    // Kept in the model's order, so the manifest reads the same whatever order they were
    // clicked in.
    updateBlueprint({
      targets: HARNESS_IDS.flatMap((id) => next.filter((target) => target.harnessId === id)),
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'text-4xl font-semibold tabular-nums',
            result.score >= 85
              ? 'text-success'
              : result.score >= 70
                ? 'text-warning'
                : 'text-danger',
          )}
        >
          {result.score}
        </span>
        <p className="text-muted-foreground flex-1 text-sm">
          How much of what this Blueprint uses each chosen harness supports natively. Adapted still
          works; it is simply expressed as instructions rather than as a feature.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Compile for</h2>
        <ul aria-label="Compile targets" className="flex flex-wrap gap-2">
          {HARNESS_IDS.map((id) => {
            const on = enabled.includes(id)
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(id)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-sm transition-colors',
                    on ? 'border-accent bg-accent-muted text-accent' : 'text-muted-foreground',
                  )}
                >
                  {HARNESS_LABELS[id]}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">What this Blueprint uses</h2>
        {enabled.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No target is chosen, so there is nothing to be compatible with yet.
          </p>
        ) : used.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This Blueprint uses none of the concepts that differ between harnesses.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">Concept support by harness</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Concept
                  </th>
                  {enabled.map((id) => (
                    <th key={id} scope="col" className="px-3 py-2 text-left font-medium">
                      {HARNESS_LABELS[id]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {used.map((row) => (
                  <tr key={row.concept} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      {conceptLabel(row.concept)}
                    </th>
                    {enabled.map((id) => {
                      const support = (row.byTarget[id] ?? 'unsupported') as Support
                      const explanation = adapterFor(id).capabilities[row.concept].explanation
                      return (
                        <td key={id} className="px-3 py-2">
                          <span
                            className={cn('flex items-center gap-1.5', SUPPORT[support].tone)}
                            title={explanation}
                          >
                            {SUPPORT[support].icon}
                            <span className="text-xs">{SUPPORT[support].label}</span>
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {result.issues.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">What that costs</h2>
          <ul aria-label="Compatibility notes" className="flex flex-col gap-1.5">
            {result.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <Card className="flex items-start gap-2 p-2.5">
                  <Badge variant={issue.severity === 'warning' ? 'warning' : 'outline'}>
                    {issue.severity}
                  </Badge>
                  <span className="min-w-0 flex-1 text-xs">{issue.message}</span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
