/**
 * The help behind a finding (P9-10).
 *
 * A finding's message says what is wrong and stops there, which leaves the reader of
 * `BP-REQ-001` unable to tell whether the Blueprint is missing something or the checks are
 * looking in the wrong place. The catalogue has carried the answer since P1; these tests hold
 * that it now reaches the screen, and that it reaches a keyboard.
 */
import { DIAGNOSTIC_CODES, type Diagnostic } from '@agent-blueprint/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DiagnosticRow } from '@/components/views/diagnostic-row'

const REQUIREMENT: Diagnostic = {
  code: 'BP-REQ-001',
  severity: 'error',
  message:
    'Requirement "Core .NET skills" is not satisfied: The toolkit provides LINQ, xUnit, dependency injection, and design-pattern skills. Nothing in the Blueprint meets any of its 4 checks.',
  ref: { kind: 'requirement', id: 'core-dotnet-skills' },
}

describe('the help behind a finding', () => {
  it('offers the remedy for the code the finding carries', async () => {
    const user = userEvent.setup()
    render(<DiagnosticRow diagnostic={REQUIREMENT} />)

    const help = screen.getByRole('button', { name: 'How to fix BP-REQ-001' })
    expect(help).toHaveAttribute('aria-expanded', 'false')

    await user.click(help)

    expect(help).toHaveAttribute('aria-expanded', 'true')
    // The remedy, not a restatement of the message: it says what to do about a check that
    // found nothing, which is the half the message cannot carry.
    expect(screen.getByText(/change the check to look for what is actually there/)).toBeVisible()
  })

  it('closes again, so a list of twenty findings does not stay unrolled', async () => {
    const user = userEvent.setup()
    render(<DiagnosticRow diagnostic={REQUIREMENT} />)
    const help = screen.getByRole('button', { name: 'How to fix BP-REQ-001' })

    await user.click(help)
    await user.click(help)

    expect(help).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/change the check to look for/)).toBeNull()
  })

  it('opens from the keyboard, because help behind a hover is help for a mouse', async () => {
    const user = userEvent.setup()
    const navigate = vi.fn()
    render(<DiagnosticRow diagnostic={REQUIREMENT} onNavigate={navigate} />)

    // Tab past the row's own navigate button and onto the help control.
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'How to fix BP-REQ-001' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByText(/change the check to look for what is actually there/)).toBeVisible()
    // Reading the help is not navigating away from it.
    expect(navigate).not.toHaveBeenCalled()
  })

  it('says nothing rather than something empty for a code it does not know', () => {
    render(
      <DiagnosticRow
        diagnostic={{ ...REQUIREMENT, code: 'BP-FROM-THE-FUTURE-001' }}
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /How to fix/ })).toBeNull()
  })

  it('has a remedy to show for every code the core can emit', () => {
    // The button appears on whichever finding the user is looking at, so a code without a
    // remedy is a button that opens an empty panel. The catalogue test in core holds the
    // prose; this holds that the UI is entitled to assume it.
    for (const entry of DIAGNOSTIC_CODES) {
      expect(entry.remedy, entry.code).toBeTruthy()
    }
  })
})

/**
 * The two controls have to be told apart at a glance (P9-12).
 *
 * Reported from use: the help control was an ⓘ, which is also the icon an info-severity
 * finding draws at the head of its own row — the same glyph saying "this is an info" and
 * "this explains it" in one picture.
 */
describe('the controls on a finding', () => {
  it('does not draw the help control with the info-severity icon', () => {
    render(<DiagnosticRow diagnostic={{ ...REQUIREMENT, severity: 'info' }} />)

    const severity = document.querySelector('.lucide-circle-alert, .lucide-info')
    const help = screen.getByRole('button', { name: 'How to fix BP-REQ-001' })
    expect(severity).not.toBeNull()
    expect(help.querySelector('.lucide-circle-help')).not.toBeNull()
    expect(help.querySelector('.lucide-info')).toBeNull()
  })

  it('offers to fix a finding a model could clear', () => {
    render(<DiagnosticRow diagnostic={REQUIREMENT} />)
    expect(screen.getByRole('button', { name: 'Fix BP-REQ-001 with AI' })).toBeVisible()
  })

  it('does not offer to fix what no artifact edit can clear', () => {
    // Renaming is a refactor that has to carry every reference with it, which is the
    // inspector's Rename, not a model rewriting one file.
    render(
      <DiagnosticRow
        diagnostic={{
          code: 'BP-ID-002',
          severity: 'error',
          message: 'Skill id "xUnit Testing" is not a slug.',
          ref: { kind: 'skill', id: 'xUnit Testing' },
        }}
      />,
    )

    expect(screen.queryByRole('button', { name: /Fix .* with AI/ })).toBeNull()
    // The help control stays: there is still a remedy to read, it is just not a model's.
    expect(screen.getByRole('button', { name: 'How to fix BP-ID-002' })).toBeVisible()
  })

  it('gives both controls a real target rather than a bare glyph', () => {
    render(<DiagnosticRow diagnostic={REQUIREMENT} />)

    for (const name of ['How to fix BP-REQ-001', 'Fix BP-REQ-001 with AI']) {
      // `size-6` — 24px. The icon inside is 14px; what grew is the padding around it.
      expect(screen.getByRole('button', { name }).className).toContain('size-6')
    }
  })
})

/**
 * Where to look (P9-19).
 *
 * Reported from use: a requirement's finding said "nothing in the Blueprint meets its check"
 * and the cause was a hook with the wrong action type — three artifacts away, with nothing on
 * the screen pointing at it. `related` has always been on the diagnostic; this renders it.
 */
describe('the pointer to where the problem is', () => {
  const UNMET = {
    code: 'BP-REQ-001',
    severity: 'error' as const,
    message:
      'Requirement "Security enforcement" is not satisfied: Secret scanning is enforced before the agent stops. Nothing in the Blueprint meets its check. The nearest is hook "Secret scan before stop": its action is command, not secret-scan.',
    ref: { kind: 'requirement' as const, id: 'security-enforcement' },
    related: [{ kind: 'hook' as const, id: 'secret-scan-before-stop' }],
    data: {
      failed: ['hook-exists'],
      nearMisses: [
        {
          kind: 'hook',
          id: 'secret-scan-before-stop',
          because: 'its action is command, not secret-scan',
        },
      ],
    },
  }

  it('lists every related artifact under the finding, and navigates to it', async () => {
    const user = userEvent.setup()
    const navigate = vi.fn()
    render(<DiagnosticRow diagnostic={UNMET} onNavigate={navigate} />)

    const pointers = screen.getByRole('list', { name: 'Where to look' })
    const hook = within(pointers).getByRole('button', { name: 'Hook: secret-scan-before-stop' })
    // The reason sits beside the first pointer: it is the whole fix, most of the time.
    expect(pointers).toHaveTextContent('its action is command, not secret-scan')

    await user.click(hook)
    // To the hook, not to the requirement the finding is filed against.
    expect(navigate).toHaveBeenCalledWith(
      { kind: 'hook', id: 'secret-scan-before-stop' },
      undefined,
    )
  })

  it('renders nothing for a finding that points nowhere else', () => {
    render(<DiagnosticRow diagnostic={REQUIREMENT} onNavigate={vi.fn()} />)
    expect(screen.queryByRole('list', { name: 'Where to look' })).toBeNull()
  })

  it('works for a contradiction, whose second half was always in related', () => {
    render(
      <DiagnosticRow
        diagnostic={{
          code: 'BP-CONTRA-001',
          severity: 'warning',
          message: 'Two artifacts tell the agent opposite things about mocking.',
          ref: { kind: 'skill', id: 'xunit' },
          related: [{ kind: 'iron-law', id: 'no-mocks' }],
        }}
        onNavigate={vi.fn()}
      />,
    )
    expect(
      within(screen.getByRole('list', { name: 'Where to look' })).getByRole('button', {
        name: 'Iron Law: no-mocks',
      }),
    ).toBeVisible()
  })
})
