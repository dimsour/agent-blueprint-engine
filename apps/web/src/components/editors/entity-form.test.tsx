import { AGENT_ROLE_INFO } from '@agent-blueprint/core'
import { readStarterFiles } from '@agent-blueprint/templates'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { parseProject } from '@/lib/storage'
import { useWorkspace, workspaceHistory } from '@/lib/state/workspace-store'

import { EntityForm } from './entity-form'
import { FIELD_EXAMPLES } from './field-examples'

const storedSkill = (id: string) =>
  useWorkspace.getState().blueprint?.skills.find((item) => item.id === id)

async function load(id = 'react-expert') {
  const { blueprint } = await parseProject(readStarterFiles(id))
  useWorkspace.getState().load('test', blueprint)
}

describe('EntityForm', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
  })

  it('edits a skill description straight into the Blueprint', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

    const description = screen.getByLabelText('Description')
    await user.clear(description)
    await user.type(description, 'Testing components by role and label.')

    const skill = useWorkspace.getState().blueprint?.skills.find((s) => s.id === 'react-testing')
    expect(skill?.description).toBe('Testing components by role and label.')
    expect(useWorkspace.getState().dirty).toBe(true)
  })

  it('renames an artifact and rewrites every reference to it', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'skill', id: 'accessibility' }} />)

    const id = screen.getByLabelText('Id')
    await user.clear(id)
    await user.type(id, 'a11y')
    await user.click(screen.getByRole('button', { name: 'Rename' }))

    const blueprint = useWorkspace.getState().blueprint
    expect(blueprint?.skills.map((skill) => skill.id)).toContain('a11y')
    expect(blueprint?.agents[0]?.skillIds).toContain('a11y')
    expect(blueprint?.agents[0]?.skillIds).not.toContain('accessibility')
  })

  it('keeps an invalid id out of the Blueprint', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'skill', id: 'accessibility' }} />)

    await user.clear(screen.getByLabelText('Id'))
    await user.type(screen.getByLabelText('Id'), 'Not A Slug')
    await user.click(screen.getByRole('button', { name: 'Rename' }))

    expect(useWorkspace.getState().blueprint?.skills.map((skill) => skill.id)).toContain(
      'accessibility',
    )
  })

  it('adds and removes a responsibility on an agent', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    const before = useWorkspace.getState().blueprint?.agents[0]?.responsibilities.length ?? 0

    await user.type(screen.getByLabelText('New Responsibilities'), 'Review pull requests{Enter}')
    expect(useWorkspace.getState().blueprint?.agents[0]?.responsibilities).toContain(
      'Review pull requests',
    )

    await user.click(screen.getByRole('button', { name: `Remove Responsibilities ${before + 1}` }))
    expect(useWorkspace.getState().blueprint?.agents[0]?.responsibilities).toHaveLength(before)
  })

  it('toggles a skill on an agent through the reference picker', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    const toggle = screen.getByRole('button', { name: 'Accessibility', pressed: true })
    await user.click(toggle)
    expect(useWorkspace.getState().blueprint?.agents[0]?.skillIds).not.toContain('accessibility')

    await user.click(screen.getByRole('button', { name: 'Accessibility', pressed: false }))
    expect(useWorkspace.getState().blueprint?.agents[0]?.skillIds).toContain('accessibility')
  })

  it('sets a permission decision from the grid', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    await user.click(screen.getByRole('button', { name: 'Delete files: deny', pressed: false }))
    expect(useWorkspace.getState().blueprint?.agents[0]?.permissions.operations['fs.delete']).toBe(
      'deny',
    )

    // Clicking the same decision again clears it back to the harness default.
    await user.click(screen.getByRole('button', { name: 'Delete files: deny', pressed: true }))
    expect(
      useWorkspace.getState().blueprint?.agents[0]?.permissions.operations['fs.delete'],
    ).toBeUndefined()
  })

  it('edits an Iron Law without losing its severity', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'iron-law', id: 'never-fake-verification' }} />)

    const rule = screen.getByLabelText('Rule')
    await user.clear(rule)
    await user.type(rule, 'Never claim a test passed without running it.')

    const law = useWorkspace
      .getState()
      .blueprint?.ironLaws.find((l) => l.id === 'never-fake-verification')
    expect(law?.rule).toBe('Never claim a test passed without running it.')
    expect(law?.severity).toBe('critical')
  })

  it('creates a linked artifact from inside a picker, without leaving the form', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    await user.click(screen.getByRole('button', { name: '+ New tool' }))

    const agent = useWorkspace.getState().blueprint?.agents[0]
    expect(agent?.toolIds).toContain('new-tool')
    // Still on the agent: adding is not the same as opening.
    expect(useWorkspace.getState().selection).toBeUndefined()
    expect(screen.getByLabelText('Name')).toHaveValue('React Expert')
  })

  it('says which other agents an agent may delegate to', async () => {
    await load('software-engineering-team')
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'agent', id: 'architect' }} />)

    // An agent is never offered itself as a delegate.
    expect(screen.queryByRole('button', { name: 'Architect' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Developer', pressed: false }))
    const architect = useWorkspace.getState().blueprint?.agents.find((a) => a.id === 'architect')
    expect(architect?.delegation?.canDelegateTo).toEqual(['developer'])

    // Delegating to nobody means no delegation at all, not an empty list.
    await user.click(screen.getByRole('button', { name: 'Developer', pressed: true }))
    expect(
      useWorkspace.getState().blueprint?.agents.find((a) => a.id === 'architect')?.delegation,
    ).toBeUndefined()
  })

  it('edits a skill resource, which used to be reachable only in the file', async () => {
    await load()
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

    await user.click(screen.getByRole('button', { name: /Add resource/ }))
    await user.clear(screen.getByLabelText('Resource 1 path'))
    await user.paste('references/queries.md')

    const skill = useWorkspace.getState().blueprint?.skills.find((s) => s.id === 'react-testing')
    expect(skill?.resources.at(-1)?.path).toBe('references/queries.md')
  })

  it('builds a requirement check, which used to need the project file', async () => {
    await load('software-engineering-team')
    const user = userEvent.setup()
    render(<EntityForm selection={{ kind: 'requirement', id: 'both-reviews-happen' }} />)

    const before =
      useWorkspace.getState().blueprint?.requirements.find((r) => r.id === 'both-reviews-happen')
        ?.checks.length ?? 0

    await user.click(screen.getByRole('button', { name: /Add check/ }))
    const requirement = useWorkspace
      .getState()
      .blueprint?.requirements.find((r) => r.id === 'both-reviews-happen')
    // A new check is valid the moment it exists, so the Blueprint never dips into invalid.
    expect(requirement?.checks).toHaveLength(before + 1)
    expect(requirement?.checks.at(-1)).toEqual({ type: 'iron-law-matches', pattern: 'never' })

    await user.click(screen.getByRole('button', { name: `Remove check ${before + 1}` }))
    expect(
      useWorkspace.getState().blueprint?.requirements.find((r) => r.id === 'both-reviews-happen')
        ?.checks,
    ).toHaveLength(before)
  })

  /**
   * "What this field is for" (P9-04).
   *
   * The example is the half that teaches, so the checks that matter are the ones about
   * reaching it and about what inserting it costs: it has to be usable without a mouse, it
   * must never quietly eat what somebody already wrote, and it has to be an edit like any
   * other rather than a special case the undo stack knows nothing about.
   */
  describe('the example behind a field', () => {
    it('is reachable, and readable, from the keyboard alone', async () => {
      await load()
      const user = userEvent.setup()
      render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

      // The info control sits between the label and the control it explains, so the field
      // itself is one Shift+Tab away from it.
      await user.click(screen.getByLabelText('When to use'))
      await user.tab({ shift: true })

      const info = screen.getByRole('button', { name: 'About When to use' })
      expect(info).toHaveFocus()
      expect(info).toHaveAttribute('aria-expanded', 'false')

      await user.keyboard('{Enter}')
      expect(info).toHaveAttribute('aria-expanded', 'true')
      // A tooltip would show this on hover and to nobody else; the panel is in the document.
      expect(screen.getByText(FIELD_EXAMPLES['skill.whenToUse'] ?? '')).toBeInTheDocument()
    })

    it('closes on Escape from where the keyboard actually is', async () => {
      await load()
      const user = userEvent.setup()
      render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

      // Opening it leaves focus on the button, which is outside the panel. Escape pressed
      // there has to close it, or the only way out of the panel is the mouse.
      const info = screen.getByRole('button', { name: 'About When to use' })
      await user.click(info)
      expect(info).toHaveAttribute('aria-expanded', 'true')

      await user.keyboard('{Escape}')
      expect(info).toHaveAttribute('aria-expanded', 'false')
      expect(info).toHaveFocus()
    })

    it('fills an empty field without asking', async () => {
      await load()
      const user = userEvent.setup()
      render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

      await user.clear(screen.getByLabelText('When to use'))
      expect(storedSkill('react-testing')?.whenToUse).toBeUndefined()

      await user.click(screen.getByRole('button', { name: 'About When to use' }))
      await user.click(screen.getByRole('button', { name: 'Insert example into When to use' }))

      expect(storedSkill('react-testing')?.whenToUse).toBe(FIELD_EXAMPLES['skill.whenToUse'])
      expect(screen.getByLabelText('When to use')).toHaveValue(FIELD_EXAMPLES['skill.whenToUse'])
    })

    it('asks before replacing what is already there, and takes no for an answer', async () => {
      await load()
      const user = userEvent.setup()
      render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

      const written = storedSkill('react-testing')?.whenToUse
      expect(written).toBeTruthy()

      await user.click(screen.getByRole('button', { name: 'About When to use' }))
      await user.click(screen.getByRole('button', { name: 'Insert example into When to use' }))

      // Nothing has changed yet: the press asked a question rather than answering it.
      expect(storedSkill('react-testing')?.whenToUse).toBe(written)

      await user.click(screen.getByRole('button', { name: 'Cancel replacing When to use' }))
      expect(storedSkill('react-testing')?.whenToUse).toBe(written)

      await user.click(screen.getByRole('button', { name: 'Insert example into When to use' }))
      await user.click(screen.getByRole('button', { name: 'Replace When to use with the example' }))
      expect(storedSkill('react-testing')?.whenToUse).toBe(FIELD_EXAMPLES['skill.whenToUse'])
    })

    it('inserts through the same path typing takes, so undo reverses it', async () => {
      await load()
      const user = userEvent.setup()
      render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

      const before = storedSkill('react-testing')?.name
      expect(before).toBe('React testing')

      await user.click(screen.getByRole('button', { name: 'About Name' }))
      await user.click(screen.getByRole('button', { name: 'Insert example into Name' }))
      await user.click(screen.getByRole('button', { name: 'Replace Name with the example' }))
      expect(storedSkill('react-testing')?.name).toBe(FIELD_EXAMPLES['skill.name'])

      // One insert is one step, not a rewrite the history cannot see.
      act(() => workspaceHistory.undo())
      expect(storedSkill('react-testing')?.name).toBe(before)
    })

    it('adds a line to a list rather than replacing the list', async () => {
      await load()
      const user = userEvent.setup()
      render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

      const before = useWorkspace.getState().blueprint?.agents[0]?.responsibilities ?? []
      expect(before.length).toBeGreaterThan(0)

      await user.click(screen.getByRole('button', { name: 'About Responsibilities' }))
      await user.click(screen.getByRole('button', { name: 'Insert example into Responsibilities' }))

      expect(useWorkspace.getState().blueprint?.agents[0]?.responsibilities).toEqual([
        ...before,
        FIELD_EXAMPLES['agent.responsibilities'],
      ])
    })
  })

  it('renders a form for every kind in the team starter without throwing', async () => {
    await load('software-engineering-team')
    const blueprint = useWorkspace.getState().blueprint
    expect(blueprint).toBeDefined()

    for (const [kind, entities] of [
      ['agent', blueprint?.agents],
      ['skill', blueprint?.skills],
      ['workflow', blueprint?.workflows],
      ['iron-law', blueprint?.ironLaws],
      ['rule', blueprint?.rules],
      ['hook', blueprint?.hooks],
      ['gate', blueprint?.gates],
      ['tool', blueprint?.tools],
      ['memory', blueprint?.memories],
      ['requirement', blueprint?.requirements],
    ] as const) {
      const first = entities?.[0]
      if (!first) continue
      const { unmount } = render(<EntityForm selection={{ kind, id: first.id }} />)
      expect(screen.getByLabelText('Name')).toHaveValue(first.name)
      unmount()
    }
  })
})

/**
 * The finding beside the field that fixes it (P9-20).
 *
 * Reported from use, after the pointer went on the finding: "is it possible to also add
 * indications and hints near the actual fields that need fixing?" The case that prompted it
 * is replayed here — a requirement failing because of a hook's action type — and the hint is
 * expected on the hook's form, beside the action select, saying where it came from.
 */
describe('findings on the form', () => {
  it('marks the field a finding on this artifact is about', async () => {
    await load()
    useWorkspace.getState().upsert('skill', {
      ...useWorkspace.getState().blueprint!.skills.find((s) => s.id === 'react-testing')!,
      description: '',
    })
    await useWorkspace.getState().flushPending()
    render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)

    // Under the Description control, and nowhere else on the form.
    const hints = screen.getAllByRole('list', { name: 'Findings about this field' })
    expect(hints).toHaveLength(1)
    expect(hints[0]).toHaveTextContent('BP-DESC-001')
    expect(hints[0]).toHaveTextContent('has no description')
  })

  it('marks the field another artifact’s check points at, and links back', async () => {
    await load()
    const user = userEvent.setup()
    useWorkspace.getState().upsert('hook', {
      id: 'secret-scan-before-stop',
      name: 'Secret scan before stop',
      description: 'Scans for secrets before the agent stops.',
      trigger: 'before-stop',
      action: { type: 'command', command: 'dotnet tool run dotnet-secretscan --scan .' },
      severity: 'critical',
    })
    useWorkspace.getState().upsert('requirement', {
      id: 'security-enforcement',
      name: 'Security enforcement',
      statement: 'Secret scanning is enforced before the agent stops.',
      level: 'must',
      checks: [{ type: 'hook-exists', trigger: 'before-stop', actionType: 'secret-scan' }],
    })
    await useWorkspace.getState().flushPending()

    render(<EntityForm selection={{ kind: 'hook', id: 'secret-scan-before-stop' }} />)

    const hint = screen.getByRole('list', { name: 'Findings about this field' })
    expect(hint).toHaveTextContent('BP-REQ-001')
    expect(hint).toHaveTextContent('its action is command, not secret-scan')

    // From the requirement, and one click takes you back to it.
    await user.click(screen.getByRole('button', { name: /from requirement: security-enforcement/ }))
    expect(useWorkspace.getState().selection).toEqual({
      kind: 'requirement',
      id: 'security-enforcement',
    })
  })

  it('shows nothing on a clean artifact', async () => {
    await load()
    render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)
    expect(screen.queryByRole('list', { name: 'Findings about this field' })).toBeNull()
  })
})

/**
 * Every option explains itself (P9-21).
 *
 * Reported from use: the Role select offers seven words and no help. The sentence beside the
 * chosen value is the same one docs/02 lists, from the same table in core.
 */
describe('option descriptions', () => {
  it('shows what the chosen role means, under the select', async () => {
    await load()
    render(<EntityForm selection={{ kind: 'agent', id: 'react-expert' }} />)

    const explained = screen.getAllByTestId('option-description').map((node) => node.textContent)
    // The role's sentence, verbatim from the core table.
    expect(explained.some((text) => text?.includes(AGENT_ROLE_INFO.worker.description))).toBe(true)
  })

  it('shows one under every select that has a table, and none under a select that has not', async () => {
    await load()
    render(<EntityForm selection={{ kind: 'skill', id: 'react-testing' }} />)
    // A skill's form has no enum selects, so nothing to explain.
    expect(screen.queryAllByTestId('option-description')).toHaveLength(0)
  })
})
