'use client'

/**
 * Settings: what this browser is holding on your behalf.
 *
 * Everything Agent Blueprint stores is local, which is easy to say and hard to believe
 * without seeing it. So this page lists the projects and drafts that exist, says roughly how
 * much room they take, and gives a way to remove them. The AI endpoint and the GitHub token
 * arrive with those features; they are named here so the shape of the page does not change
 * when they do.
 */
import { CloudUploadIcon, SparklesIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ThemeToggle } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { useClientValue } from '@/lib/client-value'
import { formatBytes } from '@/lib/utils'
import {
  clearDraft,
  fileSystemAccessSupported,
  indexedDbStore,
  type ProjectSummary,
} from '@/lib/storage'

function Pending({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode
  title: string
  detail: string
}) {
  return (
    <Card className="flex items-start gap-3 p-3 opacity-70">
      <span className="text-muted-foreground mt-0.5 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{detail}</span>
      </span>
      <Badge variant="outline">Not yet</Badge>
    </Card>
  )
}

export function Settings() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [usage, setUsage] = useState<{ used: number; quota: number } | undefined>()
  const canOpenFolder = useClientValue(fileSystemAccessSupported, false)

  const refresh = useCallback(() => {
    void indexedDbStore
      .list()
      .then(setProjects)
      .catch(() => setProjects([]))
    void navigator.storage
      ?.estimate?.()
      .then((estimate) => setUsage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 }))
      .catch(() => undefined)
  }, [])

  useEffect(refresh, [refresh])

  const forgetEverything = async () => {
    for (const project of projects) await indexedDbStore.delete(project.id)
    await clearDraft('wizard')
    toast.success('Removed every local project', {
      description: 'Anything you exported as a ZIP is unaffected.',
    })
    refresh()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-xs font-medium tracking-wide uppercase"
          >
            Agent Blueprint
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Storage</h2>
        <p className="text-muted-foreground text-sm">
          Projects are kept in this browser profile and never leave it. Clearing the site data
          removes them, so export anything you want to keep.
        </p>

        <Card className="flex flex-col gap-2 p-3">
          <span className="flex items-baseline gap-2 text-sm">
            <span className="font-medium">
              {projects.length} project{projects.length === 1 ? '' : 's'}
            </span>
            {usage ? (
              <span className="text-muted-foreground text-xs">
                {formatBytes(usage.used)} used
                {usage.quota > 0 ? ` of about ${formatBytes(usage.quota)} available` : ''}
              </span>
            ) : null}
          </span>
          {projects.length > 0 ? (
            <ul aria-label="Stored projects" className="flex flex-col gap-1">
              {projects.map((project) => (
                <li key={project.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {project.artifacts} artifacts
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => {
                      void indexedDbStore
                        .delete(project.id)
                        .then(() => {
                          toast.success(`Deleted ${project.name}`)
                          refresh()
                        })
                        .catch(() => toast.error(`Could not delete ${project.name}`))
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing stored yet.</p>
          )}
        </Card>

        <p className="text-muted-foreground text-xs">
          Opening a folder directly is{' '}
          {canOpenFolder ? 'available in this browser' : 'not available in this browser'}.
        </p>

        <Button
          variant="outline"
          className="self-start"
          disabled={projects.length === 0}
          onClick={() => void forgetEverything()}
        >
          <Trash2Icon />
          Remove every local project
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Credentials</h2>
        <p className="text-muted-foreground text-sm">
          Nothing is stored under a credential key today, because neither feature that would need
          one exists yet. When they do, keys live in this browser only and are never written into a
          Blueprint or an export.
        </p>
        <Pending
          icon={<SparklesIcon />}
          title="AI endpoint and key"
          detail="Any OpenAI-compatible endpoint. Arrives with the AI assistant."
        />
        <Pending
          icon={<CloudUploadIcon />}
          title="GitHub token"
          detail="A personal access token, or sign-in. Arrives with pushing to GitHub."
        />
      </section>
    </div>
  )
}
