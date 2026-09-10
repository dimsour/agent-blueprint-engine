'use client'

/**
 * Creating a Blueprint (P9-03).
 *
 * One question — what is this? — and then the workspace. It used to be ten, and the other
 * nine were artifact creation: a smaller, worse editor than the one waiting on the other
 * side of them, with no tree, no inspector, no "new from template" and no health bar. The
 * two things only the later steps offered still exist elsewhere: compile targets are
 * toggled from the command palette and the compatibility view, and a new project keeps the
 * `claude-code` + `codex` defaults; the evaluate step is the evaluation view, which scores
 * the real project instead of a draft.
 *
 * The draft is kept in the browser between visits. One question is short, but a brief typed
 * into "Draft with AI" is not, and a stray reload should not cost it.
 */
import type { Blueprint } from '@agent-blueprint/core'
import { CheckIcon, LoaderIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { TextAreaField, TextField } from '@/components/editors/fields'
import { Button } from '@/components/ui/button'
import { DraftWithAI } from '@/components/wizard/ai-draft'
import { clearDraft, createProject, readDraft, StorageError, writeDraft } from '@/lib/storage'
import { blockingReason, DRAFT_PLACEHOLDER_NAME, emptyDraft, setIdentity } from '@/lib/wizard/draft'

/** One draft at a time, so it needs no identity beyond the flow it belongs to. */
const DRAFT_ID = 'wizard'

export function Wizard() {
  const router = useRouter()
  const [draft, setDraft] = useState<Blueprint>(emptyDraft)
  const [restored, setRestored] = useState<Blueprint | undefined>()
  const [creating, setCreating] = useState(false)

  // Reading storage is an external system: set state from the callback, never in the body.
  useEffect(() => {
    let cancelled = false
    void readDraft<Blueprint>(DRAFT_ID).then((saved) => {
      if (!cancelled && saved) setRestored(saved)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Written on a timer rather than on every keystroke: a draft is a convenience, and this
  // screen should not be doing storage work between characters.
  useEffect(() => {
    const timer = setTimeout(() => void writeDraft(DRAFT_ID, draft), 800)
    return () => clearTimeout(timer)
  }, [draft])

  const blocked = blockingReason(draft)

  const create = async () => {
    setCreating(true)
    try {
      const summary = await createProject(draft)
      await clearDraft(DRAFT_ID)
      router.push(`/p/${summary.id}`)
    } catch (error) {
      setCreating(false)
      toast.error('Could not create the project', {
        description:
          error instanceof StorageError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error),
      })
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 px-6 py-10">
      <PageHeader title="New Blueprint" />

      {restored && restored.name !== draft.name ? (
        <p
          role="status"
          className="bg-muted flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-sm"
        >
          <span className="flex-1">
            You were part way through <span className="font-medium">{restored.name}</span>.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(restored)
              setRestored(undefined)
            }}
          >
            Pick it up
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRestored(undefined)
              void clearDraft(DRAFT_ID)
            }}
          >
            Start fresh
          </Button>
        </p>
      ) : null}

      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">What are you building?</h2>
          <p className="text-muted-foreground text-sm">
            The agents, skills, workflows and laws come next, in the editor.
          </p>
        </div>

        <div className="flex max-w-xl flex-col gap-4">
          <TextField
            label="Name"
            help="What this system is called. Everything else can change later."
            value={draft.name === DRAFT_PLACEHOLDER_NAME ? '' : draft.name}
            placeholder="Rust Review Crew"
            onChange={(name) => setDraft(setIdentity(draft, { name }))}
          />
          <TextField
            label="Id"
            help="The project slug, used for the directory and every cross-reference."
            value={draft.id}
            mono
            onChange={(id) => setDraft(setIdentity(draft, { id }))}
          />
          <TextAreaField
            label="Description"
            value={draft.description ?? ''}
            placeholder="Reviews Rust changes before they merge."
            onChange={(description) => setDraft(setIdentity(draft, { description }))}
          />
          <DraftWithAI draft={draft} onChange={setDraft} />
        </div>
      </section>

      <footer className="mt-auto flex items-center gap-2 border-t pt-4">
        {blocked ? (
          <span role="status" className="text-muted-foreground text-sm">
            {blocked}
          </span>
        ) : null}
        <span className="flex-1" />
        <Button
          variant="accent"
          onClick={() => void create()}
          disabled={creating || Boolean(blocked)}
        >
          {creating ? <LoaderIcon className="animate-spin" /> : <CheckIcon />}
          Create project
        </Button>
      </footer>
    </div>
  )
}
