/**
 * The AI settings form.
 *
 * The form's promise is that saving tells you the truth about the endpoint, and that the key
 * goes exactly where you said and nowhere else. Both are tested here against a fake endpoint,
 * because both are the kind of thing that is easy to get subtly wrong and impossible to notice
 * until it matters.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AISettings } from '@/components/settings/ai-settings'
import { AI_SETTINGS_KEY } from '@/lib/ai/settings'
import { CREDENTIAL_KEYS, STORAGE_WARNING } from '@/lib/credentials'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz'

interface Call {
  url: string
  headers: Record<string, string>
}

let calls: Call[] = []
const realFetch = globalThis.fetch

/** An endpoint that answers the probe, and records what it was sent. */
function endpoint(answer: string | number = '{"ok":true}') {
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      headers[name.toLowerCase()] = value
    }
    calls.push({ url: String(url), headers })
    if (typeof answer === 'number') return Promise.resolve(new Response('no', { status: answer }))
    if (String(url).endsWith('/models')) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: 'gpt-5-mini' }] }), { status: 200 }),
      )
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          model: 'gpt-5-mini',
          choices: [{ message: { role: 'assistant', content: answer } }],
        }),
        { status: 200 },
      ),
    )
  }) as unknown as typeof globalThis.fetch
}

beforeEach(() => {
  calls = []
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('AISettings', () => {
  it('saves the endpoint and the key where the user said, and tests it', async () => {
    endpoint()
    const user = userEvent.setup()
    render(<AISettings />)

    await user.clear(screen.getByLabelText('Model'))
    await user.type(screen.getByLabelText('Model'), 'gpt-5-mini')
    await user.type(screen.getByLabelText('API key'), KEY)
    await user.click(screen.getByRole('button', { name: 'Save and test' }))

    await screen.findByLabelText('Endpoint test')
    expect(sessionStorage.getItem(CREDENTIAL_KEYS.ai)).toBe(KEY)
    expect(localStorage.getItem(CREDENTIAL_KEYS.ai)).toBeNull()

    const settings = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) ?? '{}') as {
      model: string
      jsonSchema: boolean
    }
    expect(settings.model).toBe('gpt-5-mini')
    expect(settings.jsonSchema).toBe(true)

    // The key travelled as a header on the request, never in the URL.
    const completion = calls.find((call) => call.url.endsWith('/chat/completions'))!
    expect(completion.headers['authorization']).toBe(`Bearer ${KEY}`)
    expect(completion.url).not.toContain('sk-proj')
  })

  it('warns before the key is put somewhere that outlives the tab', async () => {
    endpoint()
    const user = userEvent.setup()
    render(<AISettings />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Keep the key'), 'local')
    // The warning is on screen before anything is stored, which is the whole point of it.
    expect(screen.getByRole('note')).toHaveTextContent(STORAGE_WARNING)
    expect(localStorage.getItem(CREDENTIAL_KEYS.ai)).toBeNull()

    await user.type(screen.getByLabelText('API key'), KEY)
    await user.click(screen.getByRole('button', { name: 'Save and test' }))
    await screen.findByLabelText('Endpoint test')
    expect(localStorage.getItem(CREDENTIAL_KEYS.ai)).toBe(KEY)
    expect(sessionStorage.getItem(CREDENTIAL_KEYS.ai)).toBeNull()
  })

  it('says which part failed rather than that something did', async () => {
    endpoint(401)
    const user = userEvent.setup()
    render(<AISettings />)

    await user.type(screen.getByLabelText('API key'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Save and test' }))

    const summary = await screen.findByLabelText('Endpoint test')
    expect(summary).toHaveTextContent('Reachable')
    expect(summary).toHaveTextContent('auth')
    expect(summary).toHaveTextContent('Check it in Settings')
  })

  it('records that an endpoint has no schema mode, so later calls do not rediscover it', async () => {
    // A model that answers with prose has told us it is not enforcing the schema.
    endpoint('Sure, ok is true!')
    const user = userEvent.setup()
    render(<AISettings />)

    await user.type(screen.getByLabelText('API key'), KEY)
    await user.click(screen.getByRole('button', { name: 'Save and test' }))
    await screen.findByLabelText('Endpoint test')

    const settings = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) ?? '{}') as {
      jsonSchema: boolean
    }
    expect(settings.jsonSchema).toBe(false)
    expect(screen.getByLabelText('Endpoint test')).toHaveTextContent('asked for in the prompt')
  })

  it('fills in a provider and offers the relay only where it would help', async () => {
    const user = userEvent.setup()
    render(<AISettings />)

    const relay = { name: /Relay through this app/ }
    expect(screen.queryByRole('checkbox', relay)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Provider'), 'ollama')

    expect(screen.getByLabelText('Base URL')).toHaveValue('http://localhost:11434/v1')
    expect(screen.getByRole('checkbox', relay)).toBeInTheDocument()
  })

  it('forgets the key on request and stops showing that one is stored', async () => {
    endpoint()
    const user = userEvent.setup()
    render(<AISettings />)

    await user.type(screen.getByLabelText('API key'), KEY)
    await user.click(screen.getByRole('button', { name: 'Save and test' }))
    await screen.findByLabelText('Endpoint test')
    expect(screen.getByText(/A key is stored/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Forget key' }))
    await waitFor(() => expect(sessionStorage.getItem(CREDENTIAL_KEYS.ai)).toBeNull())
    expect(screen.queryByText(/A key is stored/)).not.toBeInTheDocument()
  })
})
