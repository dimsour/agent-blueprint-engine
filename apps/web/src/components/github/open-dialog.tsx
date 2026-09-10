'use client'

/**
 * Opening a project that lives in a repository.
 *
 * This asks for two things and then hands over to the same path a ZIP takes: the files are read,
 * reported, and stored only when the user says so. Nothing about a repository makes it more
 * trustworthy than an archive from a colleague — the diagnostics are shown either way.
 *
 * Only `blueprint/` is read. Everything at the repository root is compiler output, rebuilt from
 * the source as soon as the project opens.
 */
import { LoaderIcon } from 'lucide-react'
import { useId, useState } from 'react'

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
import { Input } from '@/components/ui/primitives'
import { readGitHubToken } from '@/lib/github/auth'
import { GitHubError } from '@/lib/github/client'
import { readProjectFromGitHub } from '@/lib/github/open'
import { parseRepoRef } from '@/lib/github/repos'
import type { ProjectFiles } from '@/lib/storage'

export function OpenFromGitHubDialog({
  open,
  onOpenChange,
  onRead,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Hands the files to the import path, which reports what is in them before storing any. */
  onRead: (files: ProjectFiles, label: string) => Promise<void> | void
}) {
  const repoId = useId()
  const branchId = useId()

  const [repoInput, setRepoInput] = useState('')
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const chosen = parseRepoRef(repoInput)

  const read = async () => {
    if (!chosen) return
    const token = readGitHubToken()
    if (!token) {
      setError('This browser is not holding a GitHub token. Add one in Settings.')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const project = await readProjectFromGitHub(token, chosen, branch || undefined)
      onOpenChange(false)
      await onRead(project.files, `${chosen.owner}/${chosen.name} on ${project.branch}`)
    } catch (cause) {
      setError(cause instanceof GitHubError ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open from GitHub</DialogTitle>
          <DialogDescription>
            Reads the <code>blueprint/</code> directory of a repository. Nothing is stored until you
            have seen what is in it.
          </DialogDescription>
        </DialogHeader>

        <Field label="Repository" htmlFor={repoId} help="owner/name, or a GitHub URL.">
          <Input
            id={repoId}
            value={repoInput}
            placeholder="octocat/agent-blueprint"
            spellCheck={false}
            onChange={(event) => setRepoInput(event.target.value)}
          />
        </Field>

        <Field
          label="Branch"
          htmlFor={branchId}
          help="Left empty, the repository's default branch."
        >
          <Input
            id={branchId}
            value={branch}
            placeholder="main"
            spellCheck={false}
            onChange={(event) => setBranch(event.target.value)}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void read()} disabled={!chosen || busy}>
            {busy ? <LoaderIcon className="animate-spin" /> : null}
            Read the repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
