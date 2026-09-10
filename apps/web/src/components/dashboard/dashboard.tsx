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
import {
  BookOpenIcon,
  CloudUploadIcon,
  FileUpIcon,
  FolderOpenIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/theme'
import { ImportDialog } from '@/components/dashboard/import-dialog'
import { Logo } from '@/components/layout/logo'
import { OpenFromGitHubDialog } from '@/components/github/open-dialog'
import { useClientValue } from '@/lib/client-value'
import {
  fileSystemAccessSupported,
  fileSystemStore,
  importProject,
  indexedDbStore,
  type ImportPreview,
  previewImport,
  type ProjectFiles,
  type ProjectSummary,
  readUpload,
  IMPORT_ACCEPT,
  StorageError,
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
  const [preview, setPreview] = useState<ImportPreview | undefined>()
  const [githubOpen, setGithubOpen] = useState(false)
  // The server cannot know whether this browser can open a folder. Branching on it directly
  // made the server HTML and the first client render disagree, which React reports as a
  // hydration failure and recovers from by re-rendering the whole page.
  const canOpenFolder = useClientValue(fileSystemAccessSupported, false)
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

  /** Opens without asking: a starter is the app's own file, not something handed in. */
  const openFiles = useCallback(
    async (files: ProjectFiles) => {
      const { summary } = await importProject(files)
      router.push(`/p/${summary.id}`)
    },
    [router],
  )

  /** Anything from outside is read and reported first; nothing is stored until Open. */
  const inspect = useCallback(async (files: ProjectFiles, label: string, existingId?: string) => {
    setPreview(await previewImport(files, label, existingId))
    setBusy(undefined)
  }, [])

  const confirmImport = useCallback(async () => {
    if (!preview) return
    try {
      if (preview.existingId) {
        router.push(`/p/${preview.existingId}`)
        return
      }
      const { summary } = await importProject(preview.files)
      router.push(`/p/${summary.id}`)
    } catch (error) {
      // Storage can be full, blocked or denied. Saying so beats a spinner that stops.
      toast.error('Could not open that project', { description: describeError(error) })
      setPreview(undefined)
    }
  }, [preview, router])

  const startFrom = useCallback(
    async (starter: StarterInfo) => {
      setBusy(starter.id)
      try {
        const response = await fetch(`/api/starters/${starter.id}`)
        if (!response.ok) throw new Error(`Could not load the ${starter.label} template.`)
        const { files } = (await response.json()) as { files: ProjectFiles }
        await openFiles(files)
      } catch (error) {
        toast.error('Could not start from that template', { description: describeError(error) })
        setBusy(undefined)
      }
    },
    [openFiles],
  )

  const importFile = useCallback(
    async (file: File) => {
      setBusy('import')
      try {
        await inspect(await readUpload(file), file.name)
      } catch (error) {
        toast.error('Could not read that file', { description: describeError(error) })
        setBusy(undefined)
      }
    },
    [inspect],
  )

  const importFolder = useCallback(async () => {
    setBusy('folder')
    try {
      const { files, name, id } = await fileSystemStore.pickDirectory()
      // The folder is already the project: opening it must not copy it into IndexedDB, or the
      // directory the user chose quietly stops being the thing they are editing.
      await inspect(files, name, id)
    } catch (error) {
      // Cancelling the picker is not an error worth a toast.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Could not open that folder', { description: describeError(error) })
      }
      setBusy(undefined)
    }
  }, [inspect])

  const remove = useCallback(
    async (summary: ProjectSummary) => {
      try {
        await indexedDbStore.delete(summary.id)
        toast.success(`Deleted ${summary.name}`)
        await refresh()
      } catch (error) {
        toast.error(`Could not delete ${summary.name}`, { description: describeError(error) })
      }
    },
    [refresh],
  )

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        {/* The only place with room for the full lockup, so the only place that uses it; it
            carries the product's name, which is why the uppercase eyebrow that used to say it
            is gone. */}
        <div className="flex min-w-0 items-center gap-4">
          <Logo variant="lockup" size={80} alt="Agent Blueprint" className="hidden sm:block" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Design once. Test it. Compile it everywhere.
            </h1>
            <p className="text-muted-foreground text-sm">
              Define an agent system once, then compile it for Claude Code, Codex, Copilot, OpenCode
              and Pi.
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/tutorial">
              <BookOpenIcon />
              How it works
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings">
              <SettingsIcon />
              Settings
            </Link>
          </Button>
          <ThemeToggle />
        </span>
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
        {canOpenFolder ? (
          <Button
            variant="outline"
            onClick={() => void importFolder()}
            disabled={busy !== undefined}
          >
            <FolderOpenIcon />
            Open folder
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => setGithubOpen(true)} disabled={busy !== undefined}>
          <CloudUploadIcon />
          Open from GitHub
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          aria-label="Import a Blueprint archive or manifest"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void importFile(file)
          }}
        />
      </section>

      <OpenFromGitHubDialog
        open={githubOpen}
        onOpenChange={setGithubOpen}
        onRead={(files, label) => inspect(files, label)}
      />

      {preview ? (
        <ImportDialog
          preview={preview}
          onCancel={() => setPreview(undefined)}
          onOpen={confirmImport}
        />
      ) : null}

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
