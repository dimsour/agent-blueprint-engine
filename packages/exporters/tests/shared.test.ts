import {
  type Blueprint,
  DEFAULT_SOURCE_DIR,
  HARNESS_IDS,
  MemoryFs,
  toBase64,
} from '@agent-blueprint/core'
import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'

import {
  buildManifestFor,
  CLAUDE_PHRASING,
  compileBlueprint,
  emitWorkflowSkill,
  firstSentence,
  generatedHeader,
  Markdown,
  SHARED_PHRASING,
  toToml,
  walkWorkflow,
  writeCompiled,
} from '../src/index'
import { loadFixture } from './helpers'

const sourceDir = DEFAULT_SOURCE_DIR

describe('Markdown builder', () => {
  it('separates blocks with one blank line and ends with one newline', () => {
    const md = new Markdown()
    md.heading(1, 'Title').paragraph('Body').bullets(['a', 'b'])
    expect(md.render()).toBe('# Title\n\nBody\n\n- a\n- b\n')
  })

  it('escapes pipes in table cells and indents multi-line bullets', () => {
    expect(new Markdown().table(['a'], [['x | y']]).render()).toContain('| x \\| y |')
    expect(new Markdown().bullets(['line one\nline two']).render()).toBe('- line one\n  line two\n')
  })

  it('takes the first sentence for short descriptions', () => {
    expect(firstSentence('One. Two.')).toBe('One.')
    expect(firstSentence('No terminator')).toBe('No terminator')
  })
})

describe('toToml', () => {
  it('writes scalars before tables and round-trips through a TOML parser', () => {
    const text = toToml({
      approval_policy: 'on-request',
      sandbox_mode: 'workspace-write',
      features: { hooks: true },
      agents: { enabled: true, reviewer: { description: 'Reviews', config_file: 'a.toml' } },
    })
    expect(text.startsWith('approval_policy = "on-request"')).toBe(true)
    expect(parseToml(text)).toEqual({
      approval_policy: 'on-request',
      sandbox_mode: 'workspace-write',
      features: { hooks: true },
      agents: { enabled: true, reviewer: { description: 'Reviews', config_file: 'a.toml' } },
    })
  })

  it('writes multi-line strings as block strings', () => {
    const text = toToml({ developer_instructions: 'line one\nline two' })
    expect(text).toContain('"""')
    expect(parseToml(text)).toEqual({ developer_instructions: 'line one\nline two' })
  })

  it('escapes quotes and arrays', () => {
    const text = toToml({ note: 'say "hi"', args: ['a', 'b'] })
    expect(parseToml(text)).toEqual({ note: 'say "hi"', args: ['a', 'b'] })
  })
})

describe('walkWorkflow', () => {
  it('orders the fixture workflow from start to end and defers the retry edge', async () => {
    const blueprint = await loadFixture()
    const workflow = blueprint.workflows.find((candidate) => candidate.id === 'write-tests')
    const walk = walkWorkflow(workflow!)

    expect(walk.items.map((item) => item.node.id)).toEqual([
      'start',
      'understand',
      'design',
      'implement',
      'run-tests',
      'gate',
      'end',
    ])
    expect(walk.unreachable).toEqual([])
    const runTests = walk.items.find((item) => item.node.id === 'run-tests')
    expect(runTests?.deferred.map((edge) => edge.kind)).toEqual(['retry'])
  })

  it('reports nodes no path reaches', async () => {
    const blueprint = await loadFixture()
    const workflow = structuredClone(blueprint.workflows[0]!)
    workflow.nodes.push({
      id: 'orphan',
      type: 'review',
      label: 'Orphan',
      position: { x: 0, y: 0 },
      config: { contextInputs: [] },
    })
    expect(walkWorkflow(workflow).unreachable.map((node) => node.id)).toEqual(['orphan'])
  })

  it('groups parallel branches and continues at the merge node', () => {
    const workflow = {
      id: 'fan',
      name: 'Fan',
      tags: [],
      metadata: {},
      entryNodeId: 'start',
      triggers: { intents: [], agentIds: [] },
      body: '',
      nodes: [
        {
          id: 'start',
          type: 'start',
          label: 'Start',
          position: { x: 0, y: 0 },
          config: { contextInputs: [] },
        },
        {
          id: 'split',
          type: 'parallel',
          label: 'Split',
          position: { x: 0, y: 0 },
          config: { contextInputs: [] },
        },
        {
          id: 'a',
          type: 'review',
          label: 'A',
          position: { x: 0, y: 0 },
          config: { contextInputs: [] },
        },
        {
          id: 'b',
          type: 'review',
          label: 'B',
          position: { x: 0, y: 0 },
          config: { contextInputs: [] },
        },
        {
          id: 'join',
          type: 'merge',
          label: 'Join',
          position: { x: 0, y: 0 },
          config: { contextInputs: [] },
        },
        {
          id: 'end',
          type: 'end',
          label: 'End',
          position: { x: 0, y: 0 },
          config: { contextInputs: [] },
        },
      ],
      edges: [
        { id: 'e1', from: 'start', to: 'split', kind: 'sequential', required: true },
        { id: 'e2', from: 'split', to: 'a', kind: 'parallel', required: true },
        { id: 'e3', from: 'split', to: 'b', kind: 'parallel', required: true },
        { id: 'e4', from: 'a', to: 'join', kind: 'aggregation', required: true },
        { id: 'e5', from: 'b', to: 'join', kind: 'aggregation', required: true },
        { id: 'e6', from: 'join', to: 'end', kind: 'sequential', required: true },
      ],
    } as unknown as Parameters<typeof walkWorkflow>[0]

    const walk = walkWorkflow(workflow)
    expect(walk.items.map((item) => item.node.id)).toEqual(['start', 'split', 'join', 'end'])
    const group = walk.items[1]
    expect(group?.kind).toBe('group')
    if (group?.kind === 'group') {
      expect(group.groupKind).toBe('parallel')
      expect(group.branches.map((branch) => branch.items.map((item) => item.node.id))).toEqual([
        ['a'],
        ['b'],
      ])
    }
    expect(walk.unreachable).toEqual([])
  })
})

describe('emitWorkflowSkill', () => {
  it('renders every step, the gate criteria and the retry edge', async () => {
    const blueprint = await loadFixture()
    const workflow = blueprint.workflows.find((candidate) => candidate.id === 'write-tests')!
    const { body, notes } = emitWorkflowSkill(workflow, blueprint, CLAUDE_PHRASING)

    expect(notes).toEqual([])
    const steps = body.split('\n').filter((line) => /^\d+\. /.test(line))
    expect(steps).toHaveLength(7)
    expect(body).toContain('you do this yourself')
    expect(body).toContain('Apply the `test-design` skill')
    expect(body).toContain('verify by running `dotnet test`')
    expect(body).toContain('Do not continue unless every criterion below holds')
    expect(body).toContain('If tests fail, go back to step 4')
  })

  it('uses harness-specific wording for delegation', async () => {
    const blueprint = await loadFixture()
    const workflow = structuredClone(blueprint.workflows[0]!)
    const node = workflow.nodes.find((candidate) => candidate.id === 'understand')!
    node.type = 'delegate'

    const claude = emitWorkflowSkill(workflow, blueprint, CLAUDE_PHRASING).body
    const shared = emitWorkflowSkill(workflow, blueprint, SHARED_PHRASING).body
    expect(claude).toContain('Use the Agent tool to run the `testing-expert` subagent')
    expect(shared).toContain('Delegate to the `testing-expert` agent')
  })
})

describe('generatedHeader', () => {
  it('names the source file', () => {
    expect(generatedHeader('blueprint/skills/xunit/SKILL.md')).toBe(
      '<!-- Generated by Agent Blueprint from blueprint/skills/xunit/SKILL.md. Edit the source, not this file. -->',
    )
  })
})

describe('binary skill resources', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe])

  async function withAsset(): Promise<Blueprint> {
    const blueprint = structuredClone(await loadFixture())
    const skill = blueprint.skills[0]!
    skill.resources = [
      ...skill.resources,
      {
        path: 'assets/diagram.png',
        kind: 'asset',
        encoding: 'base64',
        content: toBase64(PNG),
      },
    ]
    return blueprint
  }

  it('copies the bytes into every harness that gets the skill', async () => {
    const { files } = compileBlueprint(await withAsset(), { targets: [...HARNESS_IDS] })
    const copies = files.filter((file) => file.path.endsWith('/assets/diagram.png'))

    expect(copies.length).toBeGreaterThan(0)
    for (const copy of copies) {
      expect(copy.format, copy.path).toBe('binary')
      // No header, no trailing newline: the file is the file.
      expect(copy.content, copy.path).toEqual(PNG)
    }
  })

  it('hashes it into the build manifest like anything else it owns', async () => {
    const output = compileBlueprint(await withAsset(), { targets: ['claude-code'] })
    const manifest = await buildManifestFor(output)
    const owned = Object.keys(manifest.targets['claude-code']?.files ?? {})

    expect(owned).toContain('.claude/skills/xunit/assets/diagram.png')
  })

  it('writes it, then leaves it alone on the next build', async () => {
    const blueprint = await withAsset()
    const output = compileBlueprint(blueprint, { targets: ['claude-code'] })
    const manifest = await buildManifestFor(output)
    const fs = new MemoryFs()

    const first = await writeCompiled({ ...output, buildManifest: manifest, sourceDir }, fs)
    expect(first.written).toContain('.claude/skills/xunit/assets/diagram.png')
    expect(await fs.readBinary('.claude/skills/xunit/assets/diagram.png')).toEqual(PNG)

    // Comparing bytes to bytes: reading it back as text would say it changed every time.
    const second = await writeCompiled(
      { ...output, buildManifest: manifest, sourceDir },
      fs,
      manifest,
    )
    expect(second.written).not.toContain('.claude/skills/xunit/assets/diagram.png')
    expect(second.unchanged).toContain('.claude/skills/xunit/assets/diagram.png')
  })
})
