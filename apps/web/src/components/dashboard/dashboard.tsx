'use client'

/**
 * The first screen: start something, or come back to something.
 *
 * Everything here is local. Recent projects come from IndexedDB in the browser, starters are
 * fetched from the server only when one is chosen, and import never leaves the machine.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileUpIcon, FolderOpenIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/theme'
import {
  fileSystemStore,
  importProject,
  indexedDbStore,
  type ProjectFiles,
  type ProjectSummary,
  parseProject,
  StorageError,
  zipToFiles,
} from '@/lib/storage'

export interface StarterInfo {
  id: string
  label: string
  description: string
}

function describeError(error: unknown): string {
  if (error instanceof StorageError) return error.message
  return error instanceof Error ? error.message : String(error)
}

export function Dashboard({ starters }: { starters: StarterInfo[] }) {
  const router = useRouter()
  const [recent, setRecent] = useState<ProjectSummary[]>([])
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setRecent(await indexedDbStore.list())
  }, [])

  // The recent list comes from IndexedDB, which is an external system: read it once on mount
  // and set state from the callback, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false
    indexedDbStore
      .list()
      .then((projects) => {
        if (!cancelled) setRecent(projects)
      })
      .catch(() => {
        // A browser with storage disabled simply has no recent projects.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openFiles = useCallback(
    async (files: ProjectFiles, label: string) => {
      const { summary, loaded } = await importProject(files)
      const errors = loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
      if (errors.length > 0) {
        toast.warning(`${label} opened with ${errors.length} problem(s)`, {
          description: errors[0]?.message,
        })
      }
      router.push(`/p/${summary.id}`)
    },
    [router],
  )

  const startFrom = useCallback(
    async (starter: StarterInfo) => {
      setBusy(starter.id)
      try {
        const response = await fetch(`/api/starters/${starter.id}`)
        if (!response.ok) throw new Error(`Could not load the ${starter.label} template.`)
        const { files } = (await response.json()) as { files: ProjectFiles }
        await openFiles(files, starter.label)
      } catch (error) {
        toast.error('Could not start from that template', { description: describeError(error) })
        setBusy(undefined)
      }
    },
    [openFiles],
  )

  const importZip = useCallback(
    async (file: File) => {
      setBusy('import')
      try {
        await openFiles(await zipToFiles(file), file.name)
      } catch (error) {
        toast.error('Could not import that archive', { description: describeError(error) })
        setBusy(undefined)
      }
    },
    [openFiles],
  )

  const importFolder = useCallback(async () => {
    setBusy('folder')
    try {
      const { files, name } = await fileSystemStore.pickDirectory()
      await parseProject(files)
      await openFiles(files, name)
    } catch (error) {
      // Cancelling the picker is not an error worth a toast.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Could not open that folder', { description: describeError(error) })
      }
      setBusy(undefined)
    }
  }, [openFiles])

  const remove = useCallback(
    async (summary: ProjectSummary) => {
      await indexedDbStore.delete(summary.id)
      toast.success(`Deleted ${summary.name}`)
      await refresh()
    },
    [refresh],
  )

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Agent Blueprint
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Design once. Test it. Compile it everywhere.
          </h1>
          <p className="text-muted-foreground text-sm">
            Define an agent system once, then compile it for Claude Code, Codex, Copilot, OpenCode
            and Pi.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="flex flex-wrap items-center gap-2">
        {/* A link, not a button: the wizard is a route, so it opens in a new tab like one. */}
        <Button variant="accent" asChild>
          <Link href="/new">
            <PlusIcon />
            Create Blueprint
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== undefined}
        >
          <FileUpIcon />
          Import ZIP
        </Button>
        {fileSystemStore.available ? (
          <Button
            variant="outline"
            onClick={() => void importFolder()}
            disabled={busy !== undefined}
          >
            <FolderOpenIcon />
            Open folder
          </Button>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          aria-label="Import a Blueprint ZIP archive"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void importZip(file)
          }}
        />
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Recent projects</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {recent.map((project) => (
              <li key={project.id}>
                <Card className="hover:border-accent group flex items-center justify-between gap-3 p-3 transition-colors">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => router.push(`/p/${project.id}`)}
                  >
                    <span className="block truncate text-sm font-medium">{project.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {project.artifacts} artifacts
                      {project.description ? ` · ${project.description}` : ''}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${project.name}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => void remove(project)}
                  >
                    <Trash2Icon />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Start from a template</h2>
          <span className="text-muted-foreground text-xs">
            {starters.length} complete agent systems
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {starters.map((starter) => (
            <li key={starter.id}>
              <Card className="hover:border-accent h-full p-0 transition-colors">
                <button
                  type="button"
                  className="flex h-full w-full flex-col gap-1 p-3 text-left"
                  disabled={busy !== undefined}
                  onClick={() => void startFrom(starter)}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {starter.label}
                    {busy === starter.id ? <Badge variant="accent">Opening…</Badge> : null}
                  </span>
                  <span className="text-muted-foreground text-xs">{starter.description}</span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-muted-foreground mt-auto text-xs">
        Projects are stored in this browser. Nothing is uploaded.
      </footer>
    </div>
  )
}
