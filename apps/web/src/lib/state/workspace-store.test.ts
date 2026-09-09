import { readStarterFiles } from '@agent-blueprint/templates'
import { beforeEach, describe, expect, it } from 'vitest'

import { IndexedDbStore, parseProject, resetDbForTests } from '@/lib/storage'

import { diagnosticsFor, useWorkspace, workspaceHistory } from './workspace-store'

async function loadStarter(id = 'react-expert') {
  const { blueprint } = await parseProject(readStarterFiles(id))
  useWorkspace.getState().load('test-project', blueprint)
  return blueprint
}

describe('leaving a project', () => {
  beforeEach(async () => {
    useWorkspace.getState().close()
    await resetDbForTests()
  })

  it('starts with no undo history, so undo cannot erase the project', async () => {
    await loadStarter()

    expect(workspaceHistory.canUndo).toBe(false)
    workspaceHistory.undo()
    expect(useWorkspace.getState().blueprint).toBeDefined()
  })

  it('cannot pull one project into another', async () => {
    const a = (await parseProject(readStarterFiles('react-expert'))).blueprint
    const b = (await parseProject(readStarterFiles('software-engineering-team'))).blueprint

    useWorkspace.getState().load('project-a', a)
    useWorkspace.getState().upsert('skill', { ...a.skills[0]!, description: 'edited in A' })
    useWorkspace.getState().load('project-b', b)
    workspaceHistory.undo()

    // The store is a singleton across client-side navigation, so this is the shape of the
    // bug that would otherwise autosave one project's content over another's.
    expect(useWorkspace.getState().blueprint?.id).toBe(b.id)
    expect(useWorkspace.getState().projectId).toBe('project-b')
  })

  it('writes a pending edit before switching, rather than dropping it', async () => {
    const store = new IndexedDbStore()
    const a = (await parseProject(readStarterFiles('react-expert'))).blueprint
    useWorkspace.getState().load('project-a', a)
    useWorkspace.getState().upsert('skill', { ...a.skills[0]!, description: 'about to switch' })

    // No flush: exactly what happens when someone clicks away inside the debounce window.
    useWorkspace.getState().load('project-b', a)
    await useWorkspace.getState().flushPending(store)

    const written = await store.open('project-a')
    expect(written?.[`blueprint/skills/${a.skills[0]!.id}/SKILL.md`]).toContain('about to switch')
  })

  it('carries no save state from one project to the next', async () => {
    await loadStarter()
    await loadStarter('software-engineering-team')
    const state = useWorkspace.getState()

    expect(state.saving).toBe(false)
    expect(state.saveError).toBeUndefined()
    expect(state.lastSavedAt).toBeUndefined()
  })
})

describe('undo and redo', () => {
  beforeEach(async () => {
    useWorkspace.getState().close()
    await resetDbForTests()
  })

  it('marks the workspace dirty, so the revert is persisted too', async () => {
    const blueprint = await loadStarter()
    useWorkspace.getState().upsert('skill', { ...blueprint.skills[0]!, description: 'edited' })
    await useWorkspace.getState().flushPending()
    expect(useWorkspace.getState().dirty).toBe(false)

    workspaceHistory.undo()
    expect(useWorkspace.getState().dirty).toBe(true)
  })

  it('re-validates, so the health bar cannot describe the wrong Blueprint', async () => {
    const blueprint = await loadStarter()
    const skill = blueprint.skills[0]!
    useWorkspace.getState().upsert('skill', { ...skill, description: 'edited' })
    await useWorkspace.getState().flushPending()

    workspaceHistory.undo()
    expect(useWorkspace.getState().validating).toBe(true)
    await useWorkspace.getState().flushPending()
    expect(useWorkspace.getState().blueprint?.skills[0]?.description).toBe(skill.description)
  })

  it('drops a selection the restored Blueprint no longer has', async () => {
    await loadStarter()
    const ref = useWorkspace.getState().create('skill', 'Ephemeral')
    expect(useWorkspace.getState().selection).toEqual(ref)

    workspaceHistory.undo()
    expect(useWorkspace.getState().selection).toBeUndefined()
  })
})

describe('saving', () => {
  beforeEach(async () => {
    useWorkspace.getState().close()
    await resetDbForTests()
  })

  it('stays dirty when an edit lands while the save is in flight', async () => {
    const blueprint = await loadStarter()
    const skill = blueprint.skills[0]!
    useWorkspace.getState().upsert('skill', { ...skill, description: 'first' })

    const saving = useWorkspace.getState().save()
    useWorkspace.getState().upsert('skill', { ...skill, description: 'second' })
    await saving

    // The save wrote "first"; "second" is not on disk, so the workspace is still dirty.
    expect(useWorkspace.getState().dirty).toBe(true)
  })

  it('reports a failure instead of pretending the project is saved', async () => {
    await loadStarter()
    const failing = {
      ...new IndexedDbStore(),
      kind: 'indexeddb' as const,
      available: true,
      list: async () => [],
      open: async () => undefined,
      delete: async () => {},
      importFiles: async () => {
        throw new Error('nope')
      },
      save: async () => {
        throw new Error('The database is full.')
      },
    }
    await useWorkspace.getState().save(failing)

    expect(useWorkspace.getState().saveError).toBe('The database is full.')
    expect(useWorkspace.getState().dirty).toBe(false)
  })
})

describe('the source tab', () => {
  beforeEach(async () => {
    useWorkspace.getState().close()
    await resetDbForTests()
  })

  it('refuses to leave a file that does not parse, whoever asks', async () => {
    await loadStarter()
    useWorkspace.getState().select({ kind: 'skill', id: 'react-testing' })
    useWorkspace.getState().setArtifactTab('source')
    useWorkspace.getState().setSourceError('Not applied: bad YAML')

    // The palette and the shortcuts call this directly; the guard has to live here.
    useWorkspace.getState().setArtifactTab('visual')
    expect(useWorkspace.getState().artifactTab).toBe('source')

    useWorkspace.getState().setSourceError(undefined)
    useWorkspace.getState().setArtifactTab('visual')
    expect(useWorkspace.getState().artifactTab).toBe('visual')
  })

  it('forgets the error when the selection changes', async () => {
    await loadStarter()
    useWorkspace.getState().select({ kind: 'skill', id: 'react-testing' })
    useWorkspace.getState().setSourceError('Not applied: bad YAML')
    useWorkspace.getState().select({ kind: 'skill', id: 'accessibility' })

    expect(useWorkspace.getState().sourceError).toBeUndefined()
    expect(useWorkspace.getState().artifactTab).toBe('visual')
  })
})

describe('workspace store', () => {
  beforeEach(async () => {
    useWorkspace.getState().close()
    workspaceHistory.clear()
    await resetDbForTests()
  })

  it('loads a project and validates it immediately', async () => {
    const blueprint = await loadStarter()
    const state = useWorkspace.getState()

    expect(state.projectId).toBe('test-project')
    expect(state.blueprint?.id).toBe(blueprint.id)
    expect(state.dirty).toBe(false)
    expect(state.diagnostics).toEqual([])
  })

  it('marks the project dirty on a change and revalidates after the debounce', async () => {
    await loadStarter()
    useWorkspace.getState().upsert('skill', {
      id: 'thin',
      name: 'Thin',
      description: 'A skill with no activation and no owner',
    })

    // The Blueprint changes at once; the diagnostics wait for the debounce.
    expect(useWorkspace.getState().dirty).toBe(true)
    expect(useWorkspace.getState().validating).toBe(true)
    expect(useWorkspace.getState().diagnostics).toEqual([])

    await useWorkspace.getState().flushPending()
    const codes = useWorkspace.getState().diagnostics.map((diagnostic) => diagnostic.code)
    expect(useWorkspace.getState().validating).toBe(false)
    expect(codes).toContain('BP-SKILL-010')
    expect(codes).toContain('BP-ORPHAN-001')
  })

  it('renames through core so every reference follows', async () => {
    await loadStarter()
    useWorkspace.getState().select({ kind: 'skill', id: 'react-testing' })
    useWorkspace.getState().rename('skill', 'react-testing', 'component-testing')

    const state = useWorkspace.getState()
    expect(state.blueprint?.agents[0]?.skillIds).toContain('component-testing')
    expect(state.blueprint?.agents[0]?.skillIds).not.toContain('react-testing')
    // Selection follows the rename rather than pointing at an id that no longer exists.
    expect(state.selection).toEqual({ kind: 'skill', id: 'component-testing' })

    await state.flushPending()
    expect(useWorkspace.getState().diagnostics).toEqual([])
  })

  it('refuses an invalid rename without changing anything', async () => {
    await loadStarter()
    const before = useWorkspace.getState().blueprint
    expect(() => useWorkspace.getState().rename('skill', 'react-testing', 'Not A Slug')).toThrow()
    expect(useWorkspace.getState().blueprint).toBe(before)
    expect(useWorkspace.getState().dirty).toBe(false)
  })

  it('reports the impact of a delete before it happens, then cleans up references', async () => {
    await loadStarter()
    const impact = useWorkspace.getState().impact({ kind: 'skill', id: 'accessibility' })
    expect(impact?.direct.map((ref) => ref.id)).toContain('react-expert')

    useWorkspace.getState().remove({ kind: 'skill', id: 'accessibility' })
    const state = useWorkspace.getState()
    expect(state.blueprint?.skills.map((skill) => skill.id)).not.toContain('accessibility')
    expect(state.blueprint?.agents[0]?.skillIds).not.toContain('accessibility')

    await state.flushPending()
    const diagnostics = useWorkspace.getState().diagnostics
    // No dangling reference: deleting cleaned them up.
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'BP-REF-001')).toEqual([])
    // But the starter's accessibility requirement no longer holds, and says so.
    const unmet = diagnostics.find((diagnostic) => diagnostic.code === 'BP-REQ-001')
    expect(unmet?.severity).toBe('error')
    expect(unmet?.ref).toEqual({ kind: 'requirement', id: 'accessible-by-default' })
  })

  it('undoes and redoes Blueprint changes but not selection', async () => {
    await loadStarter()
    const originalName = useWorkspace.getState().blueprint?.name

    useWorkspace.getState().updateBlueprint({ name: 'Renamed' })
    expect(useWorkspace.getState().blueprint?.name).toBe('Renamed')
    expect(workspaceHistory.canUndo).toBe(true)

    workspaceHistory.undo()
    expect(useWorkspace.getState().blueprint?.name).toBe(originalName)

    workspaceHistory.redo()
    expect(useWorkspace.getState().blueprint?.name).toBe('Renamed')

    // Selecting is not an edit, so it does not become an undo step.
    const steps = useWorkspace.temporal.getState().pastStates.length
    useWorkspace.getState().select({ kind: 'skill', id: 'react-testing' })
    expect(useWorkspace.temporal.getState().pastStates.length).toBe(steps)
  })

  it('applies a change-set through core', async () => {
    await loadStarter()
    useWorkspace.getState().apply({
      id: 'test',
      source: 'template',
      summary: 'Add a rule',
      ops: [
        {
          id: 'create:rule:be-kind',
          type: 'create',
          kind: 'rule',
          entityId: 'be-kind',
          after: {
            id: 'be-kind',
            name: 'Be kind',
            description: 'Preferred behaviour',
            guidance: 'Prefer the clearer option when two are equivalent.',
            category: 'general',
            priority: 'normal',
            paths: [],
            scope: { all: true, agentIds: [], workflowIds: [] },
            tags: [],
            metadata: {},
            body: '',
          },
        },
      ],
    })
    expect(useWorkspace.getState().blueprint?.rules.map((rule) => rule.id)).toContain('be-kind')
  })

  it('saves to the store and clears the dirty flag', async () => {
    const store = new IndexedDbStore()
    const blueprint = await loadStarter()
    await store.save(
      'test-project',
      {},
      {
        name: blueprint.name,
        blueprintId: blueprint.id,
        artifacts: 0,
      },
    )

    useWorkspace.getState().updateBlueprint({ description: 'Edited' })
    expect(useWorkspace.getState().dirty).toBe(true)

    await useWorkspace.getState().save(store)
    expect(useWorkspace.getState().dirty).toBe(false)
    expect(useWorkspace.getState().lastSavedAt).toBeGreaterThan(0)

    const saved = await store.open('test-project')
    expect(saved?.['blueprint/blueprint.yaml']).toContain('description: Edited')
  })

  it('reports a save failure instead of pretending it worked', async () => {
    await loadStarter()
    useWorkspace.getState().updateBlueprint({ description: 'Edited' })
    const failing = {
      kind: 'indexeddb' as const,
      available: true,
      list: async () => [],
      open: async () => undefined,
      save: async () => {
        throw new Error('disk full')
      },
      delete: async () => {},
      importFiles: async () => {
        throw new Error('unsupported')
      },
    }

    await useWorkspace.getState().save(failing)
    expect(useWorkspace.getState().saveError).toBe('disk full')
    expect(useWorkspace.getState().dirty).toBe(true)
  })
})

describe('diagnosticsFor', () => {
  it('finds diagnostics that name an artifact directly or as related', () => {
    const diagnostics = [
      {
        code: 'A',
        severity: 'error' as const,
        message: 'a',
        ref: { kind: 'skill' as const, id: 'x' },
      },
      {
        code: 'B',
        severity: 'warning' as const,
        message: 'b',
        ref: { kind: 'agent' as const, id: 'y' },
        related: [{ kind: 'skill' as const, id: 'x' }],
      },
      {
        code: 'C',
        severity: 'info' as const,
        message: 'c',
        ref: { kind: 'skill' as const, id: 'z' },
      },
    ]
    const found = diagnosticsFor(diagnostics, { kind: 'skill', id: 'x' })
    expect(found.map((diagnostic) => diagnostic.code)).toEqual(['A', 'B'])
  })
})
