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
import {
  capabilitiesOf,
  CONCEPT_LABELS,
  PLUGIN_LAYOUT_TARGETS,
  portabilityOf,
  type SupportLevel,
} from '@agent-blueprint/exporters'
import { CheckIcon, CircleSlashIcon, TriangleAlertIcon, WrenchIcon } from 'lucide-react'
import { useMemo } from 'react'

import { Badge, Card } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { enabledTargetIds, isPluginLayout, withTarget, withTargetOptions } from '@/lib/targets'
import { useWorkspace } from '@/lib/state/workspace-store'

const SUPPORT: Record<SupportLevel, { icon: React.ReactNode; label: string; tone: string }> = {
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

export function CompatibilityView() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const updateBlueprint = useWorkspace((state) => state.updateBlueprint)

  const enabled = useMemo(() => (blueprint ? enabledTargetIds(blueprint) : []), [blueprint])

  const result = useMemo(() => (blueprint ? portabilityOf(blueprint) : undefined), [blueprint])

  if (!blueprint || !result) return null

  const used = result.matrix.filter((row) => row.used)

  const toggle = (harnessId: HarnessId) => {
    updateBlueprint({ targets: withTarget(blueprint, harnessId, !enabled.includes(harnessId)) })
  }

  // A plugin is the same Blueprint installed from a marketplace instead of opened as a
  // repository (P9-27). The switch is per target, because only some harnesses have plugins.
  const setLayout = (harnessId: HarnessId, plugin: boolean) => {
    updateBlueprint({
      targets: withTargetOptions(blueprint, harnessId, { layout: plugin ? 'plugin' : undefined }),
    })
  }
  const pluginCapable = enabled.filter((id) => PLUGIN_LAYOUT_TARGETS.includes(id))

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-4">
        {/*
          With no target chosen the score function returns 100 as a sentinel for "cannot be
          assessed"; showing that as a perfect score would be the opposite of the truth.
        */}
        <span
          className={cn(
            'text-4xl font-semibold tabular-nums',
            enabled.length === 0
              ? 'text-muted-foreground'
              : result.score >= 85
                ? 'text-success'
                : result.score >= 70
                  ? 'text-warning'
                  : 'text-danger',
          )}
        >
          {enabled.length === 0 ? '—' : result.score}
        </span>
        <p className="text-muted-foreground flex-1 text-sm">
          {enabled.length === 0
            ? 'Portability is a question about chosen harnesses, and none is chosen.'
            : 'How much of what this Blueprint uses each chosen harness supports natively. Adapted still works; it is simply expressed as instructions rather than as a feature.'}
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
        {pluginCapable.length > 0 ? (
          <ul aria-label="Packaging" className="flex flex-col gap-1">
            {pluginCapable.map((id) => (
              <li key={id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPluginLayout(blueprint, id)}
                    onChange={(event) => setLayout(id, event.target.checked)}
                  />
                  Package for {HARNESS_LABELS[id]} as a plugin
                  <span className="text-muted-foreground text-xs">
                    — installable from this repository with a marketplace command, instead of files
                    at the root
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
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
                      {CONCEPT_LABELS[row.concept]}
                    </th>
                    {enabled.map((id) => {
                      const support = row.byTarget[id] ?? 'unsupported'
                      const explanation = capabilitiesOf(blueprint, id)[row.concept].explanation
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
