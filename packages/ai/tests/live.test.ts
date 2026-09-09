/**
 * The check nothing else can make: does this work against a real model?
 *
 * Everything else in this package runs against a fake `fetch`, which proves the code does what
 * it was written to do and nothing about whether a model will play along. Endpoints ignore
 * fields, models wrap JSON in apologies, and a schema that is perfectly valid can still be one
 * a model cannot fill in. Only a live call finds that out.
 *
 * It is skipped unless `AI_TEST_BASE_URL` is set, so CI never makes a network call and the
 * suite stays deterministic. To run it:
 *
 *   AI_TEST_BASE_URL=http://localhost:11434/v1 AI_TEST_MODEL=llama3.1 pnpm --filter @agent-blueprint/ai test:live
 *   AI_TEST_BASE_URL=https://api.openai.com/v1 AI_TEST_MODEL=gpt-5-mini AI_TEST_API_KEY=sk-… pnpm --filter @agent-blueprint/ai test:live
 *
 * Record the outcome in docs/06-ai-layer.md (model, date, result), which is what roadmap P6-09
 * asks for. The assertions are deliberately about substance rather than exact text: a model
 * that produces a different but valid Blueprint has passed.
 */
import { createEmptyBlueprint, validateBlueprint, applyChangeSet } from '@agent-blueprint/core'
import { describe, expect, it } from 'vitest'

import {
  createAIClient,
  generateBlueprint,
  improveArtifact,
  type AIClientConfig,
} from '../src/index'
import { loadFixture } from './helpers'

const baseUrl = process.env.AI_TEST_BASE_URL
const model = process.env.AI_TEST_MODEL ?? 'gpt-5-mini'
const apiKey = process.env.AI_TEST_API_KEY

/** Real calls are slow; a whole Blueprint from a local model can take a couple of minutes. */
const TIMEOUT = 240_000

function config(jsonSchema: boolean): AIClientConfig {
  return {
    baseUrl: baseUrl ?? '',
    model,
    features: { jsonSchema },
    ...(apiKey ? { apiKey } : {}),
  }
}

describe.skipIf(!baseUrl)('against a live endpoint', () => {
  it(
    'reports what the endpoint can actually do',
    async () => {
      const probe = await createAIClient(config(true)).probe()
      expect(probe.reachable, probe.error?.message).toBe(true)
      expect(probe.authenticated, probe.error?.message).toBe(true)
      // Not asserted either way: an endpoint without schema support is supported, through the
      // prompt path. What matters is that the probe says which one this is.
      console.info(
        `[live] ${baseUrl} ${probe.model}: jsonSchema=${probe.jsonSchema}, ${probe.latencyMs}ms`,
      )
    },
    TIMEOUT,
  )

  it(
    'drafts a Blueprint that applies cleanly and validates',
    async () => {
      const probe = await createAIClient(config(true)).probe()
      const client = createAIClient(config(probe.jsonSchema))
      const empty = createEmptyBlueprint({ id: 'live-check', name: 'Untitled' })

      const result = await generateBlueprint(
        { client },
        { blueprint: empty },
        'A team that reviews pull requests in a TypeScript codebase, runs the tests, and refuses to approve anything it has not verified.',
      )

      // The acceptance criterion from roadmap P6-09: zero ops rejected.
      const applied = applyChangeSet(empty, result.changeSet)
      expect(applied.rejected, JSON.stringify(applied.rejected)).toEqual([])
      expect(applied.blueprint.agents.length).toBeGreaterThan(0)
      expect(applied.blueprint.skills.length).toBeGreaterThan(0)

      // Whatever it wrote, it must not have left the project pointing at nothing.
      const dangling = validateBlueprint(applied.blueprint).filter(
        (finding) => finding.code === 'BP-REF-001',
      )
      expect(dangling, JSON.stringify(dangling)).toEqual([])
      console.info(
        `[live] drafted ${result.changeSet.ops.length} ops, notes: ${result.notes.length}`,
      )
    },
    TIMEOUT,
  )

  it(
    'improves one artifact without moving it',
    async () => {
      const probe = await createAIClient(config(true)).probe()
      const client = createAIClient(config(probe.jsonSchema))
      const blueprint = await loadFixture()

      const result = await improveArtifact(
        { client },
        { blueprint, selection: { kind: 'skill', id: 'xunit' } },
        { action: 'add-verification' },
      )

      expect(result.changeSet.ops.map((op) => op.id)).toEqual(['update:skill:xunit'])
      const applied = applyChangeSet(blueprint, result.changeSet)
      expect(applied.rejected).toEqual([])
      expect(applied.blueprint.skills.map((skill) => skill.id)).toEqual(
        blueprint.skills.map((skill) => skill.id),
      )
    },
    TIMEOUT,
  )
})
