import { renderProjectFiles } from '@agent-blueprint/core'
import { readStarterFiles } from '@agent-blueprint/templates'
import { beforeAll, describe, expect, it } from 'vitest'

import { parseProject } from '@/lib/storage'

import {
  bodyOf,
  hasPreview,
  parseEntitySource,
  renderEntitySource,
  sourceLanguage,
  sourcePathFor,
} from './artifact-source'

let blueprint: Awaited<ReturnType<typeof parseProject>>['blueprint']

beforeAll(async () => {
  blueprint = (await parseProject(readStarterFiles('react-expert'))).blueprint
})

describe('renderEntitySource', () => {
  it('is exactly the file the writer produces', () => {
    const ref = { kind: 'skill', id: 'react-testing' } as const
    const path = sourcePathFor(blueprint, ref)

    expect(path).toBe('blueprint/skills/react-testing/SKILL.md')
    expect(renderEntitySource(blueprint, ref)).toBe(renderProjectFiles(blueprint)[path])
  })

  it('knows which artifacts are YAML rather than Markdown', () => {
    expect(sourceLanguage({ kind: 'skill', id: 'x' })).toBe('markdown')
    expect(sourceLanguage({ kind: 'gate', id: 'x' })).toBe('yaml')
    expect(hasPreview({ kind: 'skill', id: 'x' })).toBe(true)
    expect(hasPreview({ kind: 'hook', id: 'x' })).toBe(false)
  })
})

describe('parseEntitySource', () => {
  const skillRef = { kind: 'skill', id: 'react-testing' } as const

  it('round-trips an untouched file into an identical artifact', () => {
    const source = renderEntitySource(blueprint, skillRef)
    const result = parseEntitySource(blueprint, skillRef, source)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const original = blueprint.skills.find((skill) => skill.id === 'react-testing')
    expect(result.entity).toEqual(original)
  })

  it('applies an edit made in the frontmatter', () => {
    const source = renderEntitySource(blueprint, skillRef).replace(
      /^description: .*$/m,
      'description: Rewritten in the source tab.',
    )
    const result = parseEntitySource(blueprint, skillRef, source)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.entity.description).toBe('Rewritten in the source tab.')
  })

  it('applies an edit made in the body', () => {
    const source = `${renderEntitySource(blueprint, skillRef)}\n## New section\n\nAdded here.\n`
    const result = parseEntitySource(blueprint, skillRef, source)

    expect(result.ok).toBe(true)
    if (result.ok) expect((result.entity as { body: string }).body).toContain('## New section')
  })

  it('returns a removed frontmatter key to its schema default', () => {
    const source = renderEntitySource(blueprint, skillRef).replace(/^whenToUse: .*$/m, '')
    const result = parseEntitySource(blueprint, skillRef, source)

    expect(result.ok).toBe(true)
    if (result.ok) expect((result.entity as { whenToUse?: string }).whenToUse).toBeUndefined()
  })

  it('keeps a skill resource that the main file does not mention', () => {
    const withResource = {
      ...blueprint,
      skills: blueprint.skills.map((skill) =>
        skill.id === 'react-testing'
          ? {
              ...skill,
              resources: [
                {
                  path: 'references/notes.md',
                  kind: 'reference' as const,
                  encoding: 'utf8' as const,
                  content: '# Notes',
                },
              ],
            }
          : skill,
      ),
    }
    const source = renderEntitySource(withResource, skillRef)
    const result = parseEntitySource(withResource, skillRef, source)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.entity as { resources: unknown[] }).resources).toHaveLength(1)
    }
  })

  it('keeps a workflow graph that lives in its own file', () => {
    const ref = { kind: 'workflow', id: 'build-component' } as const
    const source = renderEntitySource(blueprint, ref)
    expect(source).not.toContain('entryNodeId')

    const result = parseEntitySource(blueprint, ref, source)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const workflow = result.entity as { nodes: unknown[]; entryNodeId?: string }
      expect(workflow.nodes.length).toBeGreaterThan(3)
      expect(workflow.entryNodeId).toBe('start')
    }
  })

  it('ignores an id written into the frontmatter', () => {
    const source = renderEntitySource(blueprint, skillRef).replace(
      '---\n',
      '---\nid: something-else\n',
    )
    const result = parseEntitySource(blueprint, skillRef, source)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.entity.id).toBe('react-testing')
  })

  it('reports broken YAML without losing the text', () => {
    const result = parseEntitySource(blueprint, skillRef, '---\nname: [unclosed\n---\n\nBody')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message.length).toBeGreaterThan(5)
  })

  it('reports a value the schema rejects, naming the field', () => {
    const source = renderEntitySource(blueprint, skillRef).replace(/^name: .*$/m, 'name: ""')
    const result = parseEntitySource(blueprint, skillRef, source)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('name')
  })

  it('parses a YAML artifact and rejects one that is not a mapping', () => {
    const ref = { kind: 'gate', id: 'tests-pass' } as const
    const source = renderEntitySource(blueprint, ref)
    expect(source.startsWith('---')).toBe(false)

    const ok = parseEntitySource(blueprint, ref, source)
    expect(ok.ok).toBe(true)

    const bad = parseEntitySource(blueprint, ref, '- just\n- a list\n')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.message).toContain('YAML mapping')
  })

  it('round-trips every artifact in every starter', async () => {
    for (const id of ['react-expert', 'software-engineering-team', 'devops-agent']) {
      const { blueprint: starter } = await parseProject(readStarterFiles(id))
      for (const [kind, entities] of [
        ['agent', starter.agents],
        ['skill', starter.skills],
        ['workflow', starter.workflows],
        ['iron-law', starter.ironLaws],
        ['rule', starter.rules],
        ['hook', starter.hooks],
        ['gate', starter.gates],
        ['tool', starter.tools],
        ['reference', starter.references],
        ['memory', starter.memories],
        ['requirement', starter.requirements],
        ['scenario', starter.scenarios],
      ] as const) {
        for (const entity of entities) {
          const ref = { kind, id: entity.id }
          const result = parseEntitySource(starter, ref, renderEntitySource(starter, ref))
          expect(result.ok, `${id} ${kind} ${entity.id}`).toBe(true)
          if (result.ok) expect(result.entity, `${id} ${kind} ${entity.id}`).toEqual(entity)
        }
      }
    }
  })
})

describe('bodyOf', () => {
  it('returns the Markdown body for the preview', () => {
    expect(bodyOf(blueprint, { kind: 'skill', id: 'react-testing' })).toContain('#')
    expect(bodyOf(blueprint, { kind: 'gate', id: 'tests-pass' })).toBe('')
  })
})
