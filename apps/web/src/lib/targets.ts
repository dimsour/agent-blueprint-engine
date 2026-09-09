/**
 * Which harnesses a Blueprint compiles for.
 *
 * Three surfaces let you change this: the wizard, the compatibility view and the command
 * palette. They were each doing it their own way, and one of them appended a second entry
 * for a harness that was already listed but switched off, which the validator rejects as a
 * duplicate target and which then blocks export with nothing on screen to explain it.
 *
 * So the rule lives here once. A harness appears in `targets` at most once, ever. Turning one
 * off drops its row, which keeps the manifest to the harnesses that matter, unless the row
 * carries harness options: those were configured deliberately and losing them silently is
 * worse than one extra line saying `enabled: false`.
 */
import {
  type Blueprint,
  HARNESS_IDS,
  type HarnessId,
  type TargetConfig,
} from '@agent-blueprint/core'

export function enabledTargetIds(blueprint: Blueprint): HarnessId[] {
  return blueprint.targets.filter((target) => target.enabled).map((target) => target.harnessId)
}

export function isTargetEnabled(blueprint: Blueprint, harnessId: HarnessId): boolean {
  return blueprint.targets.some((target) => target.harnessId === harnessId && target.enabled)
}

/** A disabled row is only worth keeping when it holds options someone chose. */
function worthKeeping(target: TargetConfig): boolean {
  return target.enabled || Object.keys(target.options).length > 0
}

/** Turns one harness on or off. */
export function withTarget(
  blueprint: Blueprint,
  harnessId: HarnessId,
  enabled: boolean,
): TargetConfig[] {
  return withOnlyTargets(
    blueprint,
    enabled
      ? [...enabledTargetIds(blueprint), harnessId]
      : enabledTargetIds(blueprint).filter((id) => id !== harnessId),
  )
}

/** Exactly these harnesses, enabled, and nothing listed twice. */
export function withOnlyTargets(
  blueprint: Blueprint,
  enabled: readonly HarnessId[],
): TargetConfig[] {
  const wanted = new Set(enabled)
  const listed = new Set(blueprint.targets.map((target) => target.harnessId))

  const rows = [
    ...blueprint.targets.map((target) => ({ ...target, enabled: wanted.has(target.harnessId) })),
    ...enabled
      .filter((id) => !listed.has(id))
      .map((harnessId) => ({ harnessId, enabled: true, options: {} })),
  ]

  return sortTargets(rows.filter(worthKeeping))
}

/** The model's order, so the manifest reads the same however the buttons were clicked. */
function sortTargets(targets: readonly TargetConfig[]): TargetConfig[] {
  return HARNESS_IDS.flatMap((id) => targets.filter((target) => target.harnessId === id))
}
