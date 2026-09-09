import { readStarterFiles } from '@agent-blueprint/templates'
import { beforeEach, describe, expect, it } from 'vitest'

import { IndexedDbStore, parseProject, resetDbForTests } from '@/lib/storage'

import { diagnosticsFor, useWorkspace, workspaceHistory } from './workspace-store'

async function loadStarter(id = 'react-expert') {
  const { blueprint } = await parseProject(readStarterFiles(id))
  useWorkspace.getState().load('test-project', blueprint)
  workspaceHistory.clear()
  return blueprint
}

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
