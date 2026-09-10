/**
 * A diagnostic the user cannot look up is a diagnostic they cannot act on. Core has this test
 * for its own catalogue; the AI codes get the same treatment for the same reason.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { AI_DIAGNOSTIC_CODES, AI_PRESETS, PROMPTS, type PromptId } from '../src/index'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

describe('documentation', () => {
  it('documents every AI diagnostic code, in both catalogues', () => {
    const validation = read('docs/05-validation-evaluation.md')
    const aiLayer = read('docs/06-ai-layer.md')
    for (const entry of AI_DIAGNOSTIC_CODES) {
      expect(validation, entry.code).toContain(entry.code)
      expect(aiLayer, entry.code).toContain(entry.code)
    }
  })

  it('documents every preset the settings screen can offer', () => {
    const doc = read('docs/06-ai-layer.md')
    for (const preset of Object.values(AI_PRESETS)) {
      expect(doc, preset.id).toContain(`\`${preset.id}\``)
    }
  })

  it('names every operation in the operations table', () => {
    // The table is the contract with the web app: an operation absent from it is one nobody
    // knows the shape of.
    const doc = read('docs/06-ai-layer.md')
    const named: Record<PromptId, string> = {
      'generate-blueprint': 'generateBlueprint',
      'generate-artifact': 'generateArtifact',
      'improve-artifact': 'improveArtifact',
      'create-workflow': 'createWorkflowFor',
      'create-iron-laws': 'createIronLawsFor',
      'find-contradictions': 'findContradictions',
      'find-missing': 'findMissing',
      'fix-finding': 'fixFinding',
      evaluate: 'evaluate',
      compound: 'compound',
      'judge-requirements': 'judgeRequirements',
    }
    for (const id of Object.keys(PROMPTS) as PromptId[]) {
      expect(doc, id).toContain(`\`${named[id]}\``)
    }
  })
})
