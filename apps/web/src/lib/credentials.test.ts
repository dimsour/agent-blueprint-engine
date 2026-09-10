/**
 * Where a key is kept, and where it must never turn up.
 *
 * The last test is the one that matters most: a project written out of this app must not carry
 * a credential, whatever the user pasted and wherever they told the browser to keep it. The
 * rest guard the promise the settings screen makes about session versus browser storage.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  CREDENTIAL_KEYS,
  forgetAllCredentials,
  forgetCredential,
  maskCredential,
  readCredential,
  writeCredential,
} from '@/lib/credentials'
import { parseProject, projectFilesOf } from '@/lib/storage'
import { clientConfig, readAISettings, writeAISettings } from '@/lib/ai/settings'

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('credentials', () => {
  it('keeps the key only where it was told to', () => {
    writeCredential('ai', KEY, 'session')
    expect(sessionStorage.getItem(CREDENTIAL_KEYS.ai)).toBe(KEY)
    expect(localStorage.getItem(CREDENTIAL_KEYS.ai)).toBeNull()
    expect(readCredential('ai')).toEqual({ value: KEY, where: 'session' })
  })

  it('moves the key rather than leaving a copy behind', () => {
    // The bug this prevents: switch to "in this browser", then back, and the localStorage copy
    // outlives the choice to stop keeping it there.
    writeCredential('ai', KEY, 'local')
    writeCredential('ai', KEY, 'session')
    expect(localStorage.getItem(CREDENTIAL_KEYS.ai)).toBeNull()
    expect(readCredential('ai')?.where).toBe('session')
  })

  it('forgets from both places at once', () => {
    writeCredential('ai', KEY, 'local')
    writeCredential('github', 'ghp_0123456789abcdefghij', 'session')
    forgetAllCredentials()
    expect(readCredential('ai')).toBeUndefined()
    expect(readCredential('github')).toBeUndefined()

    writeCredential('ai', KEY, 'local')
    forgetCredential('ai')
    expect(localStorage.getItem(CREDENTIAL_KEYS.ai)).toBeNull()
  })

  it('shows enough of the key to recognise it and not enough to use it', () => {
    const masked = maskCredential(KEY)
    expect(masked).not.toContain('proj-abcdefghijkl')
    expect(masked.startsWith('sk-')).toBe(true)
    expect(masked.endsWith(KEY.slice(-4))).toBe(true)
    expect(maskCredential('short')).toBe('•••••')
  })

  it('is absent from the settings this app persists, and from a project it writes', async () => {
    writeCredential('ai', KEY, 'local')
    writeAISettings({
      presetId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      jsonSchema: true,
      viaProxy: false,
      extraHeaders: {},
      timeoutMs: 120_000,
      stream: true,
    })

    // The endpoint settings are persisted; the key is not part of them.
    const persisted = localStorage.getItem('ab:settings:ai') ?? ''
    expect(persisted).not.toContain(KEY)
    expect(readAISettings().model).toBe('gpt-5-mini')

    // The key reaches the client config, which is held in memory and never written anywhere.
    expect(clientConfig(readAISettings(), readCredential('ai')?.value).apiKey).toBe(KEY)

    const { blueprint } = await parseProject(readFixtureFiles('dotnet-testing-expert'))
    const written = Object.values(projectFilesOf(blueprint)).join('\n')
    expect(written).not.toContain(KEY)
    expect(written).not.toContain('ab:credentials')
  })
})
