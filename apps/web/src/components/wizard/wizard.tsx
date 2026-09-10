'use client'

/**
 * The creation wizard.
 *
 * Ten questions, one draft Blueprint. The draft is valid at every step, so a person can stop
 * anywhere from step two onwards and still get a project that opens; only the first two steps
 * hold them back, and only because a Blueprint without a name or an agent is not a Blueprint.
 *
 * The draft is kept in the browser between visits. Ten questions is long enough that a
 * closed tab or a stray reload should not mean starting again.
 */
import type { Blueprint } from '@agent-blueprint/core'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, LoaderIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import {
  AboutStep,
  AgentStep,
  ArtifactStep,
  EvaluateStep,
  FinishStep,
  MemoryStep,
  type StepProps,
  TargetsStep,
  ToolsStep,
} from '@/components/wizard/steps'
import { clearDraft, createProject, readDraft, StorageError, writeDraft } from '@/lib/storage'
import { blockingReason, emptyDraft, WIZARD_STEPS, type WizardStepId } from '@/lib/wizard/draft'
import { cn } from '@/lib/utils'

const BODIES: Record<WizardStepId, (props: StepProps) => React.ReactNode> = {
  about: AboutStep,
  agent: AgentStep,
  skills: (props) => <ArtifactStep {...props} kind="skill" />,
  workflows: (props) => <ArtifactStep {...props} kind="workflow" />,
  laws: (props) => <ArtifactStep {...props} kind="iron-law" />,
  tools: ToolsStep,
  memory: MemoryStep,
  targets: TargetsStep,
  evaluate: EvaluateStep,
  finish: FinishStep,
}

/** One wizard at a time, so the draft needs no identity beyond the flow it belongs to. */
const DRAFT_ID = 'wizard'

export function Wizard() {
  const router = useRouter()
  const [draft, setDraft] = useState<Blueprint>(emptyDraft)
  const [restored, setRestored] = useState<Blueprint | undefined>()
  const [index, setIndex] = useState(0)
  // How far the wizard has been taken, so stepping back to check something does not make
  // every step after it unreachable again.
  const [furthest, setFurthest] = useState(0)
  const [creating, setCreating] = useState(false)

  const goTo = (position: number) => {
    setIndex(position)
    setFurthest((current) => Math.max(current, position))
  }

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

  // Written on a timer rather than on every keystroke: a draft is a convenience, and the
  // wizard should not be doing storage work between characters.
  useEffect(() => {
    const timer = setTimeout(() => void writeDraft(DRAFT_ID, draft), 800)
    return () => clearTimeout(timer)
  }, [draft])

  const step = WIZARD_STEPS[index]
  if (!step) return null

  const blocked = blockingReason(draft, step.id)
  const isLast = index === WIZARD_STEPS.length - 1
  const Body = BODIES[step.id]

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

      <nav aria-label="Wizard steps" className="flex flex-wrap gap-1.5">
        {WIZARD_STEPS.map((candidate, position) => {
          const done = position < index
          const current = position === index
          return (
            <button
              key={candidate.id}
              type="button"
              // Anywhere already reached is reachable again; nothing beyond it is.
              disabled={position > furthest}
              aria-current={current ? 'step' : undefined}
              onClick={() => goTo(position)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                current && 'border-accent bg-accent-muted text-accent',
                done && 'text-muted-foreground',
                position > index && 'opacity-50',
              )}
            >
              <span className="tabular-nums">{position + 1}</span>
              {candidate.label}
            </button>
          )
        })}
      </nav>

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

      <section className="flex min-h-80 flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{step.prompt}</h2>
          <p className="text-muted-foreground text-sm">
            Step {index + 1} of {WIZARD_STEPS.length}
          </p>
        </div>
        <Body draft={draft} onChange={setDraft} />
      </section>

      <footer className="mt-auto flex items-center gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => goTo(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          <ArrowLeftIcon />
          Back
        </Button>

        {blocked ? (
          <span role="status" className="text-muted-foreground text-sm">
            {blocked}
          </span>
        ) : null}

        <span className="flex-1" />

        {isLast ? (
          <Button variant="accent" onClick={() => void create()} disabled={creating}>
            {creating ? <LoaderIcon className="animate-spin" /> : <CheckIcon />}
            Create project
          </Button>
        ) : (
          <Button
            onClick={() => goTo(Math.min(WIZARD_STEPS.length - 1, index + 1))}
            disabled={blocked !== undefined}
          >
            Next
            <ArrowRightIcon />
          </Button>
        )}
      </footer>
    </div>
  )
}
