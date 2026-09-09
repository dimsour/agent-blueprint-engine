/**
 * The editor's contract, tested without CodeMirror.
 *
 * CodeMirror is replaced by a textarea here on purpose: what needs proving is the sync and
 * the blocking, not that CodeMirror can accept keystrokes. The real editor is exercised in
 * the end-to-end suite, and the render/parse pair has its own tests in `artifact-source`.
 */
import { readStarterFiles } from '@agent-blueprint/templates'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseProject } from '@/lib/storage'
import { renderEntitySource } from '@/lib/artifact-source'
import { useWorkspace } from '@/lib/state/workspace-store'

vi.mock('@/components/editor/code-editor', () => ({
  CodeEditor: ({
    initialValue,
    onChange,
    ariaLabel,
  }: {
    initialValue: string
    onChange: (value: string) => void
    ariaLabel: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      defaultValue={initialValue}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

const { ArtifactEditor } = await import('./artifact-editor')

async function load(id = 'react-expert') {
  const { blueprint } = await parseProject(readStarterFiles(id))
  useWorkspace.getState().load('test', blueprint)
  return blueprint
}

const skill = { kind: 'skill', id: 'react-testing' } as const

describe('ArtifactEditor', () => {
  beforeEach(() => {
    useWorkspace.getState().close()
  })

  it('opens on the visual form and offers the source and preview tabs', async () => {
    await load()
    render(<ArtifactEditor selection={skill} />)

    expect(screen.getByRole('tab', { name: /Visual/ })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: /Markdown/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Preview/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('React testing')
  })

  it('labels the tab YAML and hides preview for artifacts stored as YAML', async () => {
    await load()
    render(<ArtifactEditor selection={{ kind: 'gate', id: 'tests-pass' }} />)

    expect(screen.getByRole('tab', { name: /YAML/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Preview/ })).not.toBeInTheDocument()
  })

  it('shows the file the writer would produce, and its path', async () => {
    const blueprint = await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    await user.click(screen.getByRole('tab', { name: /Markdown/ }))
    expect(screen.getByLabelText('Skill source')).toHaveValue(renderEntitySource(blueprint, skill))
    expect(screen.getByText('blueprint/skills/react-testing/SKILL.md')).toBeInTheDocument()
  })

  it('applies a source edit to the Blueprint', async () => {
    const blueprint = await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    await user.click(screen.getByRole('tab', { name: /Markdown/ }))
    const editor = screen.getByLabelText('Skill source')
    await user.clear(editor)
    await user.paste(
      renderEntitySource(blueprint, skill).replace(
        /^description: .*$/m,
        'description: Edited in the source tab.',
      ),
    )

    const updated = useWorkspace.getState().blueprint?.skills.find((s) => s.id === skill.id)
    expect(updated?.description).toBe('Edited in the source tab.')
  })

  it('shows the visual form the source edit produced', async () => {
    const blueprint = await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    await user.click(screen.getByRole('tab', { name: /Markdown/ }))
    await user.clear(screen.getByLabelText('Skill source'))
    await user.paste(
      renderEntitySource(blueprint, skill).replace(/^name: .*$/m, 'name: Renamed In Source'),
    )
    await user.click(screen.getByRole('tab', { name: /Visual/ }))

    expect(screen.getByLabelText('Name')).toHaveValue('Renamed In Source')
  })

  it('re-seeds the source from an edit made in the visual form', async () => {
    await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    const description = screen.getByLabelText('Description')
    await user.clear(description)
    await user.paste('Set from the form.')

    await user.click(screen.getByRole('tab', { name: /Markdown/ }))
    const source = screen.getByLabelText<HTMLTextAreaElement>('Skill source')
    expect(source.value).toContain('description: Set from the form.')
  })

  it('keeps the text and blocks the other tabs while the source does not parse', async () => {
    await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    await user.click(screen.getByRole('tab', { name: /Markdown/ }))
    const editor = screen.getByLabelText('Skill source')
    await user.clear(editor)
    await user.paste('---\nname: [unclosed\n---\n\nBody')

    // The problem is named, the text is untouched, and the Blueprint keeps its last value.
    expect(screen.getByRole('alert')).toHaveTextContent(/Not applied/)
    expect(editor).toHaveValue('---\nname: [unclosed\n---\n\nBody')
    expect(useWorkspace.getState().blueprint?.skills.find((s) => s.id === skill.id)?.name).toBe(
      'React testing',
    )

    expect(screen.getByRole('tab', { name: /Visual/ })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: /Visual/ }))
    expect(screen.getByLabelText('Skill source')).toBeInTheDocument()
  })

  it('lets you leave again once the source parses', async () => {
    const blueprint = await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    await user.click(screen.getByRole('tab', { name: /Markdown/ }))
    const editor = screen.getByLabelText('Skill source')
    await user.clear(editor)
    await user.paste('---\nname: [unclosed\n---\n')
    expect(screen.getByRole('tab', { name: /Visual/ })).toBeDisabled()

    await user.clear(editor)
    await user.paste(renderEntitySource(blueprint, skill))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Visual/ }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('names the field when the schema rejects a value', async () => {
    const blueprint = await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    await user.click(screen.getByRole('tab', { name: /Markdown/ }))
    await user.clear(screen.getByLabelText('Skill source'))
    await user.paste(renderEntitySource(blueprint, skill).replace(/^name: .*$/m, 'name: ""'))

    expect(screen.getByRole('alert')).toHaveTextContent(/name/)
  })

  it('previews the Markdown body', async () => {
    await load()
    const user = userEvent.setup()
    render(<ArtifactEditor selection={skill} />)

    await user.click(screen.getByRole('tab', { name: /Preview/ }))
    expect(screen.getByRole('heading', { name: 'React testing' })).toBeInTheDocument()
  })
})
