/**
 * Getting a GitHub token, and knowing what it is.
 *
 * Two ways in, because the two audiences are different. A personal access token is paste and
 * go, works with no deployment configuration at all, and is what a developer running this
 * locally will reach for. Sign-in exists for a deployment that has registered an OAuth app and
 * would rather its users never handle a token by hand.
 *
 * Both end in the same place: a string handed to `lib/credentials`, kept where the user chose,
 * and read back by nothing else (docs/08-security.md). Nothing about GitHub is stored beside
 * it — the login shown in Settings is fetched, not remembered, so a revoked token stops looking
 * valid the moment it stops being valid.
 */
import { readCredential, writeCredential, type CredentialStorage } from '@/lib/credentials'

import { viewer, type GitHubViewer } from './client'

/** What each token prefix means, in the terms GitHub itself uses. */
type TokenKind = 'fine-grained' | 'classic' | 'oauth' | 'unknown'

function tokenKind(token: string): TokenKind {
  if (token.startsWith('github_pat_')) return 'fine-grained'
  if (token.startsWith('ghp_')) return 'classic'
  if (token.startsWith('gho_') || token.startsWith('ghu_')) return 'oauth'
  return 'unknown'
}

export const TOKEN_KIND_LABELS: Record<TokenKind, string> = {
  'fine-grained': 'Fine-grained personal access token',
  classic: 'Personal access token (classic)',
  oauth: 'Sign-in token',
  unknown: 'Token',
}

/**
 * The access this app needs, said once, in both vocabularies.
 *
 * Pushing a Blueprint writes files and reads the branch it is writing onto; opening one reads.
 * Nothing here needs an organisation, a workflow, a package or a user's email, and a token
 * that grants them is a token that can do more harm if it leaks from this browser.
 */
export const TOKEN_ACCESS_HELP =
  'A fine-grained token needs Contents: Read and write on the repositories you want to push to. A classic token needs the repo scope.'

export function readGitHubToken(): string | undefined {
  return readCredential('github')?.value
}

export function storeGitHubToken(token: string, where: CredentialStorage): void {
  writeCredential('github', token, where)
}

export interface GitHubIdentity extends GitHubViewer {
  kind: TokenKind
  /**
   * True when a classic token carries `repo`. A fine-grained token reports no scopes at all,
   * so this is undefined for one rather than false: "we cannot tell from here" is the honest
   * answer, and claiming otherwise would put a red cross beside a token that works.
   */
  canWrite?: boolean
}

/** Proves the token works and says who it belongs to. Throws `GitHubError` when it does not. */
export async function identify(token: string): Promise<GitHubIdentity> {
  const who = await viewer(token)
  const kind = tokenKind(token)
  const classic = kind === 'classic' || (kind === 'unknown' && who.scopes.length > 0)
  return {
    ...who,
    kind,
    ...(classic ? { canWrite: who.scopes.includes('repo') } : {}),
  }
}

/** What the callback page posts back to the app. Same-origin; nothing else is accepted. */
interface OAuthMessage {
  source: 'agent-blueprint-github-oauth'
  token?: string
  error?: string
}

const SIGN_IN_URL = '/api/github/oauth/start'

/**
 * Sign in through the deployment's OAuth app.
 *
 * The token comes back through `postMessage` from a popup on this same origin, which is the
 * one delivery that never writes it anywhere: not a cookie, not a URL that lands in history,
 * not a server session. The listener checks the origin and the window it came from, because a
 * message event is something any page can send.
 */
export function signInWithGitHub(): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open(SIGN_IN_URL, 'agent-blueprint-github', 'width=720,height=820')
    if (!popup) {
      reject(
        new Error('The sign-in window was blocked. Allow pop-ups for this site, or paste a token.'),
      )
      return
    }

    const finish = (error?: Error, token?: string) => {
      window.removeEventListener('message', onMessage)
      clearInterval(closedTimer)
      if (error) reject(error)
      else resolve(token ?? '')
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup) return
      const message = event.data as OAuthMessage | undefined
      if (message?.source !== 'agent-blueprint-github-oauth') return
      popup.close()
      if (message.token) finish(undefined, message.token)
      else finish(new Error(message.error ?? 'GitHub sign-in did not complete.'))
    }

    window.addEventListener('message', onMessage)
    const closedTimer = setInterval(() => {
      if (popup.closed) finish(new Error('The sign-in window was closed.'))
    }, 500)
  })
}
