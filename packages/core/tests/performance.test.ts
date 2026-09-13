/**
 * How the app behaves on a Blueprint that is not small (P8-07).
 *
 * The budgets are the roadmap's: reading, validating and evaluating a 200-artifact project
 * has to stay inside a fraction of a second, because every one of them runs on a keystroke.
 * The numbers are deliberately loose — a threshold that fails on a loaded CI machine gets
 * disabled, and a disabled test measures nothing — so they catch a change in the *shape* of
 * the cost, not a few milliseconds of drift.
 */
import { stressProjectFiles } from '@agent-blueprint/fixtures'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  type Blueprint,
  buildDependencyGraph,
  countEntities,
  evaluateBlueprint,
  findOrphans,
  MemoryFs,
  readProject,
  renderProjectFiles,
  validateBlueprint,
} from '../src/index'

let blueprint: Blueprint

beforeAll(async () => {
  const result = await readProject(new MemoryFs(stressProjectFiles({ artifacts: 200 })))
  blueprint = result.blueprint
})

/** Milliseconds for one call, after a warm-up: the first is dominated by lazy compilation. */
function msPerCall(work: () => unknown, runs = 5): number {
  work()
  const started = performance.now()
  for (let run = 0; run < runs; run += 1) work()
  return (performance.now() - started) / runs
}

describe('a 200-artifact Blueprint', () => {
  it('is the size the budgets are written for', () => {
    expect(countEntities(blueprint)).toBeGreaterThanOrEqual(190)
    expect(countEntities(blueprint)).toBeLessThanOrEqual(215)
    // Every reference resolves: a dangling one would measure the error path instead.
    expect(validateBlueprint(blueprint).filter((d) => d.severity === 'error')).toEqual([])
  })

  it('validates in under 100ms', () => {
    expect(msPerCall(() => validateBlueprint(blueprint))).toBeLessThan(100)
  })

  it('builds its dependency graph in under 50ms', () => {
    expect(msPerCall(() => buildDependencyGraph(blueprint))).toBeLessThan(50)
  })

  it('finds orphans in under 50ms', () => {
    const graph = buildDependencyGraph(blueprint)
    expect(msPerCall(() => findOrphans(graph, blueprint))).toBeLessThan(50)
  })

  it('evaluates in under 200ms', () => {
    expect(msPerCall(() => evaluateBlueprint(blueprint))).toBeLessThan(200)
  })

  it('renders its project files in under 100ms', () => {
    expect(msPerCall(() => renderProjectFiles(blueprint))).toBeLessThan(100)
  })
})

describe('cost as the project grows', () => {
  /**
   * The question a fixed threshold cannot answer. Something quadratic passes at 200 and falls
   * over at 600; this fails now rather than in a support conversation.
   */
  it('validation grows about linearly, not quadratically', async () => {
    const small = (await readProject(new MemoryFs(stressProjectFiles({ artifacts: 100 }))))
      .blueprint
    const large = (await readProject(new MemoryFs(stressProjectFiles({ artifacts: 400 }))))
      .blueprint

    const smallMs = msPerCall(() => validateBlueprint(small))
    const largeMs = msPerCall(() => validateBlueprint(large))

    // Four times the artifacts. Linear would be 4x; quadratic would be 16x. Allow generous
    // headroom for a noisy machine and still catch the difference between the two.
    expect(largeMs / Math.max(smallMs, 0.5)).toBeLessThan(10)
  })

  /**
   * Evaluation compares skills pairwise, which it has to. What it used to do as well was
   * tokenize inside that loop, so the same description was parsed once per other skill: at 800
   * artifacts that was 42ms, and it is 10ms now. The comparison is still quadratic; the work
   * per comparison is not, and this is what keeps it that way.
   */
  it('evaluation grows about linearly, despite comparing skills pairwise', async () => {
    const small = (await readProject(new MemoryFs(stressProjectFiles({ artifacts: 100 }))))
      .blueprint
    const large = (await readProject(new MemoryFs(stressProjectFiles({ artifacts: 400 }))))
      .blueprint

    const smallMs = msPerCall(() => evaluateBlueprint(small))
    const largeMs = msPerCall(() => evaluateBlueprint(large))

    expect(largeMs / Math.max(smallMs, 0.5)).toBeLessThan(10)
  })
})
