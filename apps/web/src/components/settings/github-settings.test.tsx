/**
 * The GitHub card in Settings.
 *
 * The behaviour worth pinning down is not the form. It is that the token goes exactly where the
 * user chose and nowhere else, that it is never shown back to them in full, and that what the
 * card claims about the token is what GitHub said rather than what the prefix suggests
 * (docs/08-security.md).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubSettings } from '@/components/settings/github-settings'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const CLASSIC = 'ghp_0123456789abcdefghij0123456789abcd'
const FINE_GRAINED = 'github_pat_11ABCDE0123456789abcdefghi'
const realFetch = globalThis.fetch

function githubAnswers(scopes: string, status = 200): void {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ login: 'octocat', name: 'Mona', avatar_url: null }), {
        status,
        headers: { 'x-oauth-scopes': scopes },
      }),
    ),
  ) as unknown as typeof globalThis.fetch
}

async function save(token: string, where?: string) {
  const user = userEvent.setup()
  render(<GitHubSettings oauthAvailable={false} />)
  if (where) await user.selectOptions(screen.getByLabelText('Keep the token'), where)
  await user.type(screen.getByLabelText('Personal access token'), token)
  await user.click(screen.getByRole('button', { name: 'Save and check' }))
  return user
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

describe('the GitHub settings card', () => {
  it('keeps the token in session storage by default, and out of the other one', async () => {
    githubAnswers('repo')
    await save(CLASSIC)

    await waitFor(() => expect(screen.getByLabelText('Token check')).toBeInTheDocument())
    expect(sessionStorage.getItem('ab:credentials:github')).toBe(CLASSIC)
    expect(localStorage.getItem('ab:credentials:github')).toBeNull()
  })

  it('keeps it in the browser only when that was chosen, and only in one place', async () => {
    githubAnswers('repo')
    await save(CLASSIC, 'local')

    await waitFor(() => expect(localStorage.getItem('ab:credentials:github')).toBe(CLASSIC))
    expect(sessionStorage.getItem('ab:credentials:github')).toBeNull()
  })

  it('says what the account is, and never shows the token back in full', async () => {
    githubAnswers('repo, read:org')
    await save(CLASSIC)

    await screen.findByText(/Mona \(octocat\)/)
    expect(screen.getByText(/Carries the repo scope/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(CLASSIC)
  })

  it('says a classic token without the scope cannot push, because GitHub says so', async () => {
    githubAnswers('read:user')
    await save(CLASSIC)

    expect(await screen.findByText(/Missing the repo scope/)).toBeInTheDocument()
  })

  it('will not claim a fine-grained token cannot push, because GitHub does not say', async () => {
    githubAnswers('')
    await save(FINE_GRAINED)

    expect(await screen.findByText(/reports no scopes for this kind of token/)).toBeInTheDocument()
    expect(screen.queryByText(/Missing the repo scope/)).not.toBeInTheDocument()
  })

  it('stores nothing when GitHub rejects the token', async () => {
    githubAnswers('', 401)
    await save(CLASSIC)

    await waitFor(() => expect(screen.queryByLabelText('Token check')).not.toBeInTheDocument())
    expect(sessionStorage.getItem('ab:credentials:github')).toBeNull()
    expect(localStorage.getItem('ab:credentials:github')).toBeNull()
  })

  it('forgets the token from both places at once', async () => {
    githubAnswers('repo')
    const user = await save(CLASSIC)
    await waitFor(() => expect(sessionStorage.getItem('ab:credentials:github')).toBe(CLASSIC))
    localStorage.setItem('ab:credentials:github', 'a stale copy from another session')

    await user.click(screen.getByRole('button', { name: 'Forget token' }))

    expect(sessionStorage.getItem('ab:credentials:github')).toBeNull()
    expect(localStorage.getItem('ab:credentials:github')).toBeNull()
  })

  it('offers sign-in only where the deployment has an OAuth app', () => {
    render(<GitHubSettings oauthAvailable={false} />)
    expect(screen.queryByRole('button', { name: /Sign in with GitHub/ })).not.toBeInTheDocument()

    render(<GitHubSettings oauthAvailable />)
    expect(screen.getByRole('button', { name: /Sign in with GitHub/ })).toBeInTheDocument()
  })
})
