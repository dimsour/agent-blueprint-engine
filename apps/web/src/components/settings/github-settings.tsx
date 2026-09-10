'use client'

/**
 * The GitHub token, and proof that it works.
 *
 * A token is opaque: pasting one tells you nothing about whether it can reach the repository
 * you care about, and finding out halfway through a push is finding out too late. So saving it
 * asks GitHub who it belongs to, and what comes back is shown — the account, the kind of token,
 * and for a classic one whether it carries the scope this app needs.
 *
 * For a fine-grained token that last answer is deliberately absent rather than negative. GitHub
 * reports no scopes for one, and its access is per repository; a red cross beside a token that
 * works would be a lie told confidently. The push preview is where that gets settled, against
 * the repository it actually concerns.
 */
import { CheckIcon, Loader2Icon, LogInIcon, ShieldCheckIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { Field } from '@/components/editors/fields'
import { Button } from '@/components/ui/button'
import { Badge, Card, Input } from '@/components/ui/primitives'
import { useClientValue } from '@/lib/client-value'
import {
  forgetCredential,
  maskCredential,
  readCredential,
  STORAGE_WARNING,
  type CredentialStorage,
} from '@/lib/credentials'
import { GitHubError } from '@/lib/github/client'
import {
  identify,
  signInWithGitHub,
  storeGitHubToken,
  TOKEN_ACCESS_HELP,
  TOKEN_KIND_LABELS,
  type GitHubIdentity,
} from '@/lib/github/auth'

const STORAGE_LABELS: Record<CredentialStorage, string> = {
  session: 'Until this tab closes',
  local: 'In this browser, until removed',
}

const EMPTY = JSON.stringify({ where: 'session' })

function readStored(): string {
  const credential = readCredential('github')
  return JSON.stringify({
    where: credential?.where ?? 'session',
    ...(credential ? { token: credential.value } : {}),
  })
}

export function GitHubSettings({ oauthAvailable }: { oauthAvailable: boolean }) {
  const tokenId = useId()
  const storageId = useId()

  const [where, setWhere] = useState<CredentialStorage>('session')
  const [stored, setStored] = useState<string | undefined>()
  const [token, setToken] = useState('')
  const [identity, setIdentity] = useState<GitHubIdentity | undefined>()
  const [checking, setChecking] = useState(false)

  // Web storage is absent while this renders on the server; the first client render corrects
  // it. Same shape as the AI card, for the same reason.
  const hydrated = useClientValue(readStored, EMPTY)
  const [adopted, setAdopted] = useState(EMPTY)
  if (hydrated !== adopted) {
    setAdopted(hydrated)
    const state = JSON.parse(hydrated) as { where: CredentialStorage; token?: string }
    setWhere(state.where)
    setStored(state.token)
  }

  const check = async (value: string) => {
    setChecking(true)
    try {
      const who = await identify(value)
      storeGitHubToken(value, where)
      setStored(value)
      setToken('')
      setIdentity(who)
      toast.success(`Signed in as ${who.login}.`)
    } catch (error) {
      setIdentity(undefined)
      toast.error(error instanceof GitHubError ? error.message : 'That token could not be checked.')
    } finally {
      setChecking(false)
    }
  }

  const signIn = async () => {
    try {
      await check(await signInWithGitHub())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'GitHub sign-in did not complete.')
    }
  }

  const forget = () => {
    forgetCredential('github')
    setStored(undefined)
    setToken('')
    setIdentity(undefined)
    toast.success('Removed the token from this browser.')
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <Field
        label="Personal access token"
        htmlFor={tokenId}
        help={
          stored
            ? `A token is stored: ${maskCredential(stored)}. Type a new one to replace it.`
            : TOKEN_ACCESS_HELP
        }
      >
        <Input
          id={tokenId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          placeholder={stored ? '••••••••' : 'github_pat_… or ghp_…'}
          onChange={(event) => setToken(event.target.value)}
        />
      </Field>

      <Field label="Keep the token" htmlFor={storageId}>
        <select
          id={storageId}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={where}
          onChange={(event) => setWhere(event.target.value as CredentialStorage)}
        >
          {(['session', 'local'] as const).map((option) => (
            <option key={option} value={option}>
              {STORAGE_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>

      {where === 'local' ? (
        <p role="note" className="text-muted-foreground border-l-2 pl-3 text-xs">
          {STORAGE_WARNING}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void check(token)} disabled={checking || !token}>
          {checking ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
          Save and check
        </Button>
        {oauthAvailable ? (
          <Button variant="outline" onClick={() => void signIn()} disabled={checking}>
            <LogInIcon />
            Sign in with GitHub
          </Button>
        ) : null}
        {stored ? (
          <Button variant="outline" onClick={forget}>
            Forget token
          </Button>
        ) : null}
      </div>

      {identity ? <IdentitySummary identity={identity} /> : null}
    </Card>
  )
}

function IdentitySummary({ identity }: { identity: GitHubIdentity }) {
  return (
    <div className="flex flex-col gap-1.5" aria-label="Token check">
      <p className="flex items-center gap-2 text-sm">
        <CheckIcon className="size-4 text-emerald-600" />
        <span>{identity.name ? `${identity.name} (${identity.login})` : identity.login}</span>
        <Badge variant="outline">{TOKEN_KIND_LABELS[identity.kind]}</Badge>
      </p>
      <p className="text-muted-foreground text-xs">
        {identity.canWrite === undefined
          ? 'GitHub reports no scopes for this kind of token. Whether it can write to a repository is decided per repository, and the push preview says so before anything is written.'
          : identity.canWrite
            ? 'Carries the repo scope, so it can push to repositories this account can write to.'
            : `Missing the repo scope, so it can read but not push. Scopes: ${identity.scopes.join(', ') || 'none'}.`}
      </p>
    </div>
  )
}
