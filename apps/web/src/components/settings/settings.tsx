'use client'

/**
 * Settings: what this browser is holding on your behalf.
 *
 * Everything Agent Blueprint stores is local, which is easy to say and hard to believe
 * without seeing it. So this page lists the projects and drafts that exist, says roughly how
 * much room they take, and gives a way to remove them. The editor's preferences follow. The
 * AI endpoint sits here too, with its key kept where the user chose and nowhere else; the
 * GitHub token arrives with pushing.
 */
import { Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AISettings } from '@/components/settings/ai-settings'
import { EditorSettings } from '@/components/settings/editor-settings'
import { GitHubSettings } from '@/components/settings/github-settings'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { useClientValue } from '@/lib/client-value'
import { formatBytes } from '@/lib/utils'
import { forgetAllCredentials } from '@/lib/credentials'
import {
  clearDraft,
  fileSystemAccessSupported,
  indexedDbStore,
  type ProjectSummary,
} from '@/lib/storage'

export function Settings({ oauthAvailable }: { oauthAvailable: boolean }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [usage, setUsage] = useState<{ used: number; quota: number } | undefined>()
  // Forgetting every credential has to be visible in the card that shows one; remounting it is
  // cheaper than a store for two values read from web storage.
  const [credentialsVersion, setCredentialsVersion] = useState(0)
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
      <PageHeader title="Settings" />

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
        <h2 className="text-sm font-semibold">Editor</h2>
        <p className="text-muted-foreground text-sm">
          How the workspace treats an edit. Stored in this browser with the other preferences.
        </p>
        <EditorSettings />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">AI endpoint</h2>
        <p className="text-muted-foreground text-sm">
          Any endpoint that speaks the OpenAI chat protocol. The key stays in this browser, is never
          written into a Blueprint or an export, and is not part of anything this app saves about
          your projects.
        </p>
        <AISettings key={credentialsVersion} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">GitHub</h2>
        <p className="text-muted-foreground text-sm">
          A token lets this app push a project to a repository and open one back from it. Like the
          AI key, it stays in this browser and is never written into a Blueprint or an export.
        </p>
        <GitHubSettings key={credentialsVersion} oauthAvailable={oauthAvailable} />
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            forgetAllCredentials()
            setCredentialsVersion((version) => version + 1)
            toast.success('Removed every credential from this browser.')
          }}
        >
          <Trash2Icon />
          Forget credentials
        </Button>
      </section>
    </div>
  )
}
