'use client'

/**
 * Pushing a Blueprint to a repository.
 *
 * The shape of this dialog follows one rule: nothing leaves the browser until the user has seen
 * exactly what would. So it is two steps, and the second is a preview — every path that would
 * be added, changed or removed, what the compiler thinks of the Blueprint, which files this app
 * would be overwriting without having written them, and anything in the content that looks like
 * a credential. Only then is there a button that pushes.
 *
 * The refusals are deliberate and each has a different reason:
 *
 * - a Blueprint with errors compiles to files that misrepresent it, so the push is blocked;
 * - a file this app does not own is skipped until it is ticked, one by one;
 * - something shaped like a credential blocks until it is ticked, because publishing a
 *   repository is where that stops being recoverable (docs/08-security.md);
 * - a plan with nothing in it offers nothing to press.
 */
import {
  AlertTriangleIcon,
  CheckIcon,
  CloudUploadIcon,
  ExternalLinkIcon,
  KeyRoundIcon,
  Loader2Icon,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'

import { Field } from '@/components/editors/fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlays'
import { Badge, Input } from '@/components/ui/primitives'
import { readGitHubToken } from '@/lib/github/auth'
import { GitHubError } from '@/lib/github/client'
import { type FileChange, planPush, type PushPlan, writesFor } from '@/lib/github/plan'
import { pushToGitHub } from '@/lib/github/push'
import {
  getRepository,
  type GitHubRepo,
  listBranches,
  listRepositories,
  parseRepoRef,
} from '@/lib/github/repos'
import { GitHubTreeFs, readRemoteTree, type RemoteTree } from '@/lib/github/tree'
import { scanForSecrets, type SecretFinding } from '@/lib/secret-scan'
import { useWorkspace } from '@/lib/state/workspace-store'

/**
 * The default commit message. No date, no counts: the same Blueprint pushed twice should read
 * the same way, and the repository already records when.
 */
const DEFAULT_MESSAGE = 'Update the Blueprint'

interface Prepared {
  plan: PushPlan
  findings: SecretFinding[]
  repo: GitHubRepo
  tree: RemoteTree | undefined
}

export function PushDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Push to GitHub</DialogTitle>
          <DialogDescription>
            The project source and everything the compiler makes from it, in one commit.
          </DialogDescription>
        </DialogHeader>
        {/* Only mounted while the dialog is open, which is what makes every answer below —
            the token, the plan, what was ticked — belong to this attempt and not the last. */}
        <Push />
      </DialogContent>
    </Dialog>
  )
}

function Push() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const repoId = useId()
  const branchId = useId()
  const messageId = useId()

  // Read once, on the way in, rather than held: Settings may have changed it since, or the tab
  // it was pasted into may have closed.
  const [token] = useState(() => readGitHubToken())
  const [repoInput, setRepoInput] = useState('')
  const [branch, setBranch] = useState('')
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [prepared, setPrepared] = useState<Prepared | undefined>()
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'preview' | 'push' | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [pushed, setPushed] = useState<{ url: string; count: number } | undefined>()

  // Suggesting the repositories this token can push to costs one request and saves the user
  // remembering how a repository is spelled.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    listRepositories(token)
      .then((found) => {
        if (!cancelled) setRepos(found.filter((repo) => repo.canPush))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  const chosen = parseRepoRef(repoInput)

  // Offering the branches of the repository being typed is worth one request; it is also how
  // the user finds out the repository is reachable before building a plan against it.
  useEffect(() => {
    if (!token || !chosen) return
    let cancelled = false
    listBranches(token, chosen)
      .then((found) => {
        if (cancelled) return
        setBranches(found.map((entry) => entry.name))
      })
      .catch(() => {
        if (!cancelled) setBranches([])
      })
    return () => {
      cancelled = true
    }
  }, [token, chosen?.owner, chosen?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = async () => {
    if (!token || !chosen || !blueprint) return
    setBusy('preview')
    setError(undefined)
    try {
      const repo = await getRepository(token, chosen)
      const target = branch || repo.defaultBranch
      setBranch(target)

      const tree = await readRemoteTree(token, chosen, target)
      const fs = new GitHubTreeFs(token, chosen, tree)
      const plan = await planPush(
        blueprint,
        tree
          ? {
              fs,
              commitSha: tree.commitSha,
              truncated: tree.truncated,
              prime: (files) => fs.prime(files),
            }
          : undefined,
      )

      // Everything this push could carry is scanned, conflicts included, so a warning does not
      // appear only after one is ticked. What blocks is narrower: a finding in a file that is
      // actually going, since a conflict left alone publishes nothing.
      const { writes } = writesFor(
        plan,
        plan.conflicts.map((conflict) => conflict.path),
      )
      setPrepared({ plan, findings: scanForSecrets(writes), repo, tree })
      setAccepted(new Set())
    } catch (cause) {
      setError(cause instanceof GitHubError ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const push = async () => {
    if (!token || !chosen || !prepared) return
    setBusy('push')
    setError(undefined)
    try {
      const { writes, deletes } = writesFor(
        prepared.plan,
        [...accepted].filter((path) => prepared.plan.conflicts.some((c) => c.path === path)),
      )
      const result = await pushToGitHub({
        token,
        repo: chosen,
        branch: branch || prepared.repo.defaultBranch,
        message: message || DEFAULT_MESSAGE,
        ...(prepared.tree ? { parentCommit: prepared.tree.commitSha } : {}),
        writes,
        deletes,
      })
      setPushed({ url: result.url, count: result.written + result.deleted })
      toast.success(`Pushed to ${chosen.owner}/${chosen.name}`)
    } catch (cause) {
      setError(cause instanceof GitHubError ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const toggle = (path: string) => {
    setAccepted((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Every finding blocks, including one in a file that is only a conflict. That is not
  // over-blocking: compiled content comes from the source, so anything key-shaped in a compiled
  // file is also in an artifact this push is carrying regardless.
  const blockedBySecret = (prepared?.findings ?? []).some(
    (finding) => !accepted.has(secretKey(finding)),
  )
  const nothingToDo = prepared !== undefined && prepared.plan.changes.length === 0
  const canPush =
    prepared !== undefined && prepared.plan.ok && !blockedBySecret && !nothingToDo && !busy

  return (
    <>
      {!token ? (
        <MissingToken />
      ) : pushed ? (
        <Pushed url={pushed.url} count={pushed.count} />
      ) : (
        <div className="flex flex-col gap-4">
          <Field
            label="Repository"
            htmlFor={repoId}
            help="owner/name, or a GitHub URL. Only repositories this token can push to are suggested."
          >
            <Input
              id={repoId}
              list={`${repoId}-list`}
              value={repoInput}
              placeholder="octocat/agent-blueprint"
              spellCheck={false}
              onChange={(event) => {
                setRepoInput(event.target.value)
                setPrepared(undefined)
              }}
            />
            <datalist id={`${repoId}-list`}>
              {repos.map((repo) => (
                <option key={repo.fullName} value={repo.fullName} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Branch"
            htmlFor={branchId}
            help="A branch that does not exist yet is created by this push."
          >
            <Input
              id={branchId}
              list={`${branchId}-list`}
              value={branch}
              placeholder="main"
              spellCheck={false}
              onChange={(event) => {
                setBranch(event.target.value)
                setPrepared(undefined)
              }}
            />
            <datalist id={`${branchId}-list`}>
              {branches.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>

          <Field label="Commit message" htmlFor={messageId}>
            <Input
              id={messageId}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </Field>

          {prepared ? (
            <Preview
              prepared={prepared}
              accepted={accepted}
              onToggle={toggle}
              nothingToDo={nothingToDo}
            />
          ) : null}

          {error ? (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          ) : null}
        </div>
      )}

      {token && !pushed ? (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => void preview()}
            disabled={!chosen || busy !== undefined}
          >
            {busy === 'preview' ? <Loader2Icon className="animate-spin" /> : null}
            {prepared ? 'Look again' : 'Preview the changes'}
          </Button>
          <Button onClick={() => void push()} disabled={!canPush}>
            {busy === 'push' ? <Loader2Icon className="animate-spin" /> : <CloudUploadIcon />}
            Push
          </Button>
        </DialogFooter>
      ) : null}
    </>
  )
}

function MissingToken() {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-muted-foreground text-sm">
        This browser is not holding a GitHub token. Add one in Settings — it stays in this browser
        and is never written into a Blueprint or an export.
      </p>
      <Button asChild variant="outline">
        <Link href="/settings">
          <KeyRoundIcon />
          Open Settings
        </Link>
      </Button>
    </div>
  )
}

function Pushed({ url, count }: { url: string; count: number }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="flex items-center gap-2 text-sm">
        <CheckIcon className="size-4 text-emerald-600" />
        {count} {count === 1 ? 'file' : 'files'} in one commit.
      </p>
      <Button asChild variant="outline">
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLinkIcon />
          See it on GitHub
        </a>
      </Button>
    </div>
  )
}

const KIND_LABELS: Record<FileChange['kind'], string> = {
  add: 'new',
  update: 'changed',
  delete: 'removed',
}

function Preview({
  prepared,
  accepted,
  onToggle,
  nothingToDo,
}: {
  prepared: Prepared
  accepted: Set<string>
  onToggle: (path: string) => void
  nothingToDo: boolean
}) {
  const { plan, findings } = prepared
  const errors = plan.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      {!plan.ok ? (
        <Note tone="danger">
          {errors.length} {errors.length === 1 ? 'error' : 'errors'} in this Blueprint. Compiled
          files would misrepresent it, so nothing is pushed until they are fixed.
        </Note>
      ) : null}

      {nothingToDo ? (
        <p className="text-muted-foreground text-sm">
          Nothing to push: this branch already has exactly this Blueprint
          {plan.unchanged > 0 ? `, all ${plan.unchanged} files of it` : ''}.
        </p>
      ) : (
        <p className="text-sm">
          {plan.newBranch ? 'Creates the branch, with ' : ''}
          {plan.changes.length} {plan.changes.length === 1 ? 'file' : 'files'} in one commit
          {plan.unchanged > 0 ? `, leaving ${plan.unchanged} unchanged` : ''}.
        </p>
      )}

      {plan.truncated ? (
        <Note tone="warning">
          GitHub stopped listing this repository&apos;s files, so a file that should be removed may
          be missing from this list. Nothing here will be overwritten that is not listed.
        </Note>
      ) : null}

      {plan.changes.length > 0 ? (
        <ul aria-label="Changes" className="flex max-h-56 flex-col gap-0.5 overflow-auto text-sm">
          {plan.changes.map((change) => (
            <li key={change.path} className="flex items-baseline gap-2">
              <Badge variant={change.kind === 'delete' ? 'danger' : 'outline'}>
                {KIND_LABELS[change.kind]}
              </Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{change.path}</span>
              {change.handEdited ? (
                <span className="text-warning text-xs">edited on GitHub</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {plan.conflicts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Files this app did not write</p>
          <p className="text-muted-foreground text-xs">
            They already exist on the branch and are not in the build manifest, so they are left
            alone unless you say otherwise.
          </p>
          {plan.conflicts.map((conflict) => (
            <Choice
              key={conflict.path}
              id={conflict.path}
              checked={accepted.has(conflict.path)}
              onToggle={onToggle}
              label={conflict.path}
              detail="Overwrite it with the compiled version"
            />
          ))}
        </div>
      ) : null}

      {findings.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Note tone="danger">
            Something in these files looks like a credential. Publishing a repository is where that
            stops being recoverable.
          </Note>
          {findings.map((finding) => (
            <Choice
              key={secretKey(finding)}
              id={secretKey(finding)}
              checked={accepted.has(secretKey(finding))}
              onToggle={onToggle}
              label={`${finding.path}:${finding.line} — ${finding.kind}`}
              detail={finding.excerpt}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Choice({
  id,
  checked,
  onToggle,
  label,
  detail,
}: {
  id: string
  checked: boolean
  onToggle: (id: string) => void
  label: string
  detail: string
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={() => onToggle(id)} />
      <span className="min-w-0">
        <span className="block font-mono text-xs break-all">{label}</span>
        <span className="text-muted-foreground block text-xs">{detail}</span>
      </span>
    </label>
  )
}

function Note({ tone, children }: { tone: 'danger' | 'warning'; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 border-l-2 pl-3 text-xs ${
        tone === 'danger' ? 'text-danger border-danger' : 'text-warning border-warning'
      }`}
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** A finding is identified by where it is, so ticking one does not tick another like it. */
function secretKey(finding: SecretFinding): string {
  return `${finding.path}:${finding.line}:${finding.kind}`
}
