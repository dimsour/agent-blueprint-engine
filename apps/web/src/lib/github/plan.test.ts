/**
 * The plan, against a branch that is only a map of files.
 *
 * Four questions decide whether a push can be trusted, and they are all here: does a first push
 * carry the whole project, does a second push of an unchanged project do nothing at all, does a
 * file this app did not write survive, and does a file it did write but someone edited on GitHub
 * get reported before it is replaced.
 */
import { MemoryFs } from '@agent-blueprint/core'
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { describe, expect, it } from 'vitest'

import { parseProject, type ProjectFiles } from '@/lib/storage'

import { planPush, type PushPlan, type RemoteBranch, writesFor } from './plan'

async function fixture() {
  const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
  return blueprint
}

function branch(files: ProjectFiles): RemoteBranch {
  return { fs: new MemoryFs(files), truncated: false }
}

/** What the branch looks like after a push has been applied. */
function applied(before: ProjectFiles, plan: PushPlan, accepted: string[] = []): ProjectFiles {
  const { writes, deletes } = writesFor(plan, accepted)
  const after = { ...before, ...writes }
  for (const path of deletes) delete after[path]
  return after
}

describe('planning a push', () => {
  it('carries the whole project to a branch that does not exist yet', async () => {
    const blueprint = await fixture()
    const plan = await planPush(blueprint, undefined)

    expect(plan.newBranch).toBe(true)
    expect(plan.conflicts).toEqual([])
    expect(plan.unchanged).toBe(0)
    expect(plan.changes.every((change) => change.kind === 'add')).toBe(true)
    expect(plan.changes.some((change) => change.path === 'blueprint/blueprint.yaml')).toBe(true)
    expect(plan.changes.some((change) => change.path === 'blueprint/build-manifest.json')).toBe(
      true,
    )
    expect(plan.changes.some((change) => change.path === 'CLAUDE.md')).toBe(true)
  })

  it('does nothing on a second push of a project nobody has touched', async () => {
    const blueprint = await fixture()
    const first = await planPush(blueprint, undefined)
    const remote = applied({}, first)

    const second = await planPush(blueprint, branch(remote))

    expect(second.changes).toEqual([])
    expect(second.conflicts).toEqual([])
    expect(second.unchanged).toBe(Object.keys(remote).length)
  })

  /**
   * Switching a pushed project to a plugin (P9-27) rewrites the README with the install
   * commands, and a push knows the repository, so the commands name it (P9-33).
   */
  it('rewrites its own README when the layout changes, naming the repository', async () => {
    const blueprint = await fixture()
    const first = await planPush(blueprint, undefined)
    const remote = applied({}, first)

    const asPlugin = {
      ...blueprint,
      targets: [
        { harnessId: 'claude-code' as const, enabled: true, options: { layout: 'plugin' } },
      ],
    }
    const second = await planPush(asPlugin, branch(remote), { repository: 'octocat/blueprints' })

    expect(second.conflicts).toEqual([])
    const readme = second.changes.find((change) => change.path === 'README.md')
    expect(readme?.kind).toBe('update')
    expect(readme?.content).toContain('/plugin marketplace add octocat/blueprints')
    expect(readme?.content).toContain('/plugin install dotnet-testing-expert@dotnet-testing-expert')
    expect(readme?.content).not.toContain('<owner>/<repo>')
    // The project-layout files it wrote before go, and the plugin's come.
    expect(second.changes.some((c) => c.path === 'CLAUDE.md' && c.kind === 'delete')).toBe(true)
    expect(second.changes.some((c) => c.path === '.claude-plugin/marketplace.json')).toBe(true)
  })

  it('leaves a file it did not write alone, and writes it only when that is accepted', async () => {
    const blueprint = await fixture()
    const handWritten = '# Our own instructions\n\nWritten before any of this existed.\n'
    const plan = await planPush(blueprint, branch({ 'CLAUDE.md': handWritten }))

    expect(plan.changes.some((change) => change.path === 'CLAUDE.md')).toBe(false)
    expect(plan.conflicts.map((conflict) => conflict.path)).toEqual(['CLAUDE.md'])

    expect(writesFor(plan).writes['CLAUDE.md']).toBeUndefined()
    expect(writesFor(plan, ['CLAUDE.md']).writes['CLAUDE.md']).toContain('Agent Blueprint')
  })

  it('says which of its own files were edited on GitHub before it replaces them', async () => {
    const blueprint = await fixture()
    const first = await planPush(blueprint, undefined)
    const remote = applied({}, first)
    remote['CLAUDE.md'] = `${remote['CLAUDE.md'] ?? ''}\n<!-- edited in the GitHub editor -->\n`

    const plan = await planPush(blueprint, branch(remote))
    const change = plan.changes.find((entry) => entry.path === 'CLAUDE.md')

    expect(change).toMatchObject({ kind: 'update', handEdited: true })
    // The manifest is the only other thing that moves: it records what was pushed, not when.
    expect(plan.changes.map((entry) => entry.path)).toEqual(['CLAUDE.md'])
  })

  it('removes what the Blueprint no longer has, source and compiled alike', async () => {
    const blueprint = await fixture()
    const first = await planPush(blueprint, undefined)
    const remote = applied({}, first)

    const withoutASkill = {
      ...blueprint,
      skills: blueprint.skills.slice(1),
      agents: blueprint.agents.map((agent) => ({
        ...agent,
        skillIds: agent.skillIds.filter((id) => id !== blueprint.skills[0]?.id),
      })),
    }
    const plan = await planPush(withoutASkill, branch(remote))
    const deleted = plan.changes.filter((change) => change.kind === 'delete').map((c) => c.path)
    const dropped = blueprint.skills[0]?.id ?? ''

    expect(deleted.some((path) => path.startsWith(`blueprint/skills/${dropped}/`))).toBe(true)
    expect(deleted.some((path) => path.startsWith(`.claude/skills/${dropped}/`))).toBe(true)
    expect(applied(remote, plan)[`blueprint/skills/${dropped}/SKILL.md`]).toBeUndefined()
  })

  it('reports the compiler rather than pushing files that misrepresent the Blueprint', async () => {
    const blueprint = await fixture()
    const broken = {
      ...blueprint,
      agents: blueprint.agents.map((agent) => ({ ...agent, skillIds: ['no-such-skill'] })),
    }
    const plan = await planPush(broken, undefined)

    expect(plan.ok).toBe(false)
    expect(plan.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true)
  })

  it('carries through that GitHub stopped listing, because a deletion may be missing', async () => {
    const blueprint = await fixture()
    const plan = await planPush(blueprint, { ...branch({}), truncated: true })
    expect(plan.truncated).toBe(true)
  })
})

/**
 * The consequence recorded when P7 was reviewed: a push deletes anything under the source
 * directory the project writer does not produce, and before P8-04 a binary asset was exactly
 * such a file. Now the writer produces it, so it survives — and the test that proves it is the
 * one that would have caught the loss.
 */
describe('a binary asset in the source directory', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe])
  const ASSET = 'blueprint/skills/xunit/assets/diagram.png'

  async function blueprintWithAsset() {
    const files: ProjectFiles = { ...readFixtureFiles('dotnet-testing-expert'), [ASSET]: PNG }
    const { blueprint } = await parseProject(files)
    return blueprint
  }

  it('is pushed, byte for byte, rather than dropped', async () => {
    const blueprint = await blueprintWithAsset()
    const plan = await planPush(blueprint, undefined)

    const change = plan.changes.find((candidate) => candidate.path === ASSET)
    expect(change?.kind).toBe('add')
    expect(change?.content).toEqual(PNG)
  })

  it('is not deleted from a branch that already has it', async () => {
    const blueprint = await blueprintWithAsset()
    const first = await planPush(blueprint, undefined)
    const remote = applied({}, first)

    const second = await planPush(blueprint, branch(remote))

    expect(second.changes.filter((change) => change.kind === 'delete')).toEqual([])
    expect(second.changes).toEqual([])
  })

  it('still deletes a file under the source directory that is not part of the project', async () => {
    const blueprint = await blueprintWithAsset()
    const first = await planPush(blueprint, undefined)
    const remote = { ...applied({}, first), 'blueprint/leftover.txt': 'from an older layout' }

    const second = await planPush(blueprint, branch(remote))

    expect(second.changes).toEqual([{ path: 'blueprint/leftover.txt', kind: 'delete' }])
  })
})
