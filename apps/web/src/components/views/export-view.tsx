'use client'

/**
 * What the compiler would write, before it writes it.
 *
 * The whole product turns on one claim: design once, compile everywhere. This is the screen
 * where that claim is checkable rather than promised, so it shows the actual files, their
 * actual contents, and which artifact each one came from.
 *
 * Errors block the download. A Blueprint the validator rejects would compile to files that
 * misrepresent it, and shipping those is worse than refusing.
 */
import { type Diagnostic, type EntityRef, HARNESS_LABELS } from '@agent-blueprint/core'
import { compileBlueprint, type GeneratedFile } from '@agent-blueprint/exporters'
import { CheckIcon, CopyIcon, DownloadIcon, FileIcon, LoaderIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { DiagnosticRow } from '@/components/views/diagnostic-row'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { downloadZip, filesToZip, projectFilesOf } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/state/workspace-store'

/** Bytes as a short human string. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} kB`
}

/** Downloads one file on its own, for anyone who wants to paste it somewhere by hand. */
function downloadOne(path: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = path.split('/').at(-1) ?? 'file.txt'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function ExportView() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const select = useWorkspace((state) => state.select)
  const [openPath, setOpenPath] = useState<string>()
  const [busy, setBusy] = useState(false)

  const compiled = useMemo(() => {
    if (!blueprint) return undefined
    try {
      return compileBlueprint(blueprint)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [blueprint])

  if (!blueprint || !compiled) return null

  if ('error' in compiled) {
    return (
      <p role="alert" className="text-danger p-4 text-sm">
        The compiler could not run: {compiled.error}
      </p>
    )
  }

  const errors = compiled.diagnostics.filter((d: Diagnostic) => d.severity === 'error')
  const source = projectFilesOf(blueprint)
  const sourceFiles: GeneratedFile[] = Object.keys(source)
    .sort()
    .map((path) => ({
      path,
      content: source[path] ?? '',
      format: 'markdown' as const,
      owner: 'shared' as const,
      sourceRefs: [],
    }))

  const groups: { title: string; files: GeneratedFile[] }[] = [
    { title: 'Source', files: sourceFiles },
    ...compiled.targets.map((target) => ({
      title: HARNESS_LABELS[target],
      files: compiled.files
        .filter((file) => file.owner === target || file.owner === 'shared')
        .sort((a, b) => (a.path < b.path ? -1 : 1)),
    })),
  ]

  const open = groups.flatMap((group) => group.files).find((file) => file.path === openPath)

  const download = async () => {
    setBusy(true)
    try {
      const everything: Record<string, string> = { ...source }
      for (const file of compiled.files) everything[file.path] = file.content
      downloadZip(await filesToZip(everything), `${blueprint.id}.zip`)
      toast.success(`Exported ${Object.keys(everything).length} files`, {
        description: 'Source and compiled output, ready to drop into a repository.',
      })
    } catch (error) {
      toast.error('Could not build the archive', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-72 shrink-0 flex-col border-r">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <Badge variant="outline">{compiled.files.length + sourceFiles.length} files</Badge>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={busy || errors.length > 0}
            onClick={() => void download()}
          >
            {busy ? (
              <LoaderIcon className="size-3 animate-spin" />
            ) : (
              <DownloadIcon className="size-3" />
            )}
            Download
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-1">
          {groups.map((group) => (
            <div key={group.title} className="mb-2">
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium tracking-wide uppercase">
                {group.title}
              </p>
              <ul aria-label={`${group.title} files`}>
                {group.files.map((file) => (
                  <li key={`${group.title}:${file.path}`}>
                    <button
                      type="button"
                      onClick={() => setOpenPath(file.path)}
                      aria-current={openPath === file.path ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left',
                        openPath === file.path ? 'bg-accent-muted text-accent' : 'hover:bg-muted',
                      )}
                    >
                      <FileIcon className="size-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {file.path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="panel min-w-0 flex-1">
        {errors.length > 0 ? (
          <div className="border-danger bg-danger-muted shrink-0 border-b p-3">
            <p role="alert" className="text-danger text-sm font-medium">
              {errors.length} error{errors.length === 1 ? '' : 's'} block this export.
            </p>
            <ul aria-label="Errors blocking export" className="mt-1.5 flex flex-col gap-0.5">
              {errors.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  <DiagnosticRow
                    diagnostic={diagnostic}
                    onNavigate={(ref: EntityRef | undefined, nodeId) => {
                      if (ref) select(ref, nodeId ? { nodeId } : {})
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {open ? (
          <>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{open.path}</span>
              <Badge variant="outline">{formatBytes(new Blob([open.content]).size)}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(open.path)
                    .then(() => toast.success('Copied the path'))
                    .catch(() => toast.error('Could not copy the path'))
                }}
              >
                <CopyIcon className="size-3" />
                Copy path
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadOne(open.path, open.content)}
              >
                <DownloadIcon className="size-3" />
                Save
              </Button>
            </div>

            {open.sourceRefs.length > 0 ? (
              <p className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1.5 text-xs">
                From
                {open.sourceRefs.map((ref) => (
                  <button
                    key={`${ref.kind}:${ref.id}`}
                    type="button"
                    onClick={() => select(ref)}
                    className="hover:border-accent rounded border px-1.5 py-0.5"
                  >
                    {ref.id}
                  </button>
                ))}
              </p>
            ) : null}

            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
              {open.content}
            </pre>
          </>
        ) : (
          <div className="flex flex-col gap-2 p-4">
            <p className="text-muted-foreground text-sm">
              Choose a file to see exactly what would be written.
            </p>
            {errors.length === 0 ? (
              <p className="text-success flex items-center gap-1.5 text-sm">
                <CheckIcon className="size-3.5" />
                Nothing is blocking this export.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
