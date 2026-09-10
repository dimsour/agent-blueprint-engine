/**
 * The scan that runs before anything is published.
 *
 * Two properties matter more than the pattern list: a finding must point at a line, and it
 * must not reproduce the secret it found — a screenshot of the warning would otherwise be the
 * leak it exists to prevent.
 */
import { readFixtureFiles } from '@agent-blueprint/fixtures'
import { describe, expect, it } from 'vitest'

import { scanForSecrets } from './secret-scan'

describe('scanning for credentials', () => {
  it('finds the shapes a Git host warns about, with the line they are on', () => {
    const findings = scanForSecrets({
      'blueprint/skills/deploy/SKILL.md': [
        '# Deploy',
        '',
        'Run it with AKIAIOSFODNN7EXAMPLE and it works.',
      ].join('\n'),
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      path: 'blueprint/skills/deploy/SKILL.md',
      line: 3,
      kind: 'AWS access key',
    })
  })

  it('never puts the value in the finding', () => {
    const key = 'sk-abcdefghijklmnopqrstuvwxyz012345'
    const [finding] = scanForSecrets({ 'CLAUDE.md': `Use ${key} for now.` })

    expect(finding?.excerpt).not.toContain(key)
    expect(finding?.excerpt).toContain('sk-a')
    expect(finding?.excerpt).toContain('•')
  })

  it.each([
    ['ghp_0123456789abcdefghij0123456789abcd', 'GitHub token'],
    ['github_pat_11ABCDE0123456789abcdefghi', 'GitHub fine-grained token'],
    ['sk-ant-api03-abcdefghijklmnop', 'Anthropic key'],
    ['xoxb-123456789012-abcdefghijkl', 'Slack token'],
    ['-----BEGIN OPENSSH PRIVATE KEY-----', 'Private key'],
    ['eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY.SflKxwRJSMeKKF2QT4', 'JSON Web Token'],
    ['api_key = 8f14e45fceea167a5a36dedd4bea2543', 'Assigned credential'],
  ])('recognises %s', (text, kind) => {
    expect(scanForSecrets({ 'a.md': text })[0]?.kind).toBe(kind)
  })

  it('leaves ordinary prose alone, including the words that describe a key', () => {
    const findings = scanForSecrets({
      'blueprint/agents/reviewer.md': [
        'The agent reads an API key from the environment.',
        'Set OPENAI_API_KEY before running it; never commit the value.',
        'See docs/08-security.md for what this project does with tokens.',
      ].join('\n'),
    })
    expect(findings).toEqual([])
  })

  it('says nothing about a real project, which is what makes blocking on it bearable', () => {
    expect(scanForSecrets(readFixtureFiles('dotnet-testing-expert'))).toEqual([])
  })

  it('reports every file it finds something in, in a stable order', () => {
    const findings = scanForSecrets({
      'z.md': 'AKIAIOSFODNN7EXAMPLE',
      'a.md': 'AKIAIOSFODNN7EXAMPLE',
    })
    expect(findings.map((finding) => finding.path)).toEqual(['a.md', 'z.md'])
  })
})
