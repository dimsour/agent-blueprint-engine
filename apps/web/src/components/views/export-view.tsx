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
import {
  type Blueprint,
  byteLength,
  type Diagnostic,
  type EntityRef,
  HARNESS_LABELS,
  sameFile,
} from '@agent-blueprint/core'
import { compileBlueprint, type GeneratedFile } from '@agent-blueprint/exporters'
import { CheckIcon, CopyIcon, DownloadIcon, FileIcon, LoaderIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { DiagnosticRow } from '@/components/views/diagnostic-row'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import {
  downloadBlob,
  downloadZip,
  filesToZip,
  type ProjectFiles,
  projectFilesOf,
} from '@/lib/storage'
import { blockedBySecrets, SecretFindings } from '@/components/secret-findings'
import { scanForSecrets } from '@/lib/secret-scan'
import { cn, formatBytes } from '@/lib/utils'
import { useWorkspace } from '@/lib/state/workspace-store'

/** Everything the archive would hold: the source project plus everything compiled from it. */
function assembleArchive(blueprint: Blueprint, files: readonly GeneratedFile[]): ProjectFiles {
  const everything: ProjectFiles = projectFilesOf(blueprint)
  for (const file of files) {
    // A compiled file quietly replacing a source file is the one way this archive could ship
    // something other than what the screen showed.
    if (file.path in everything && !sameFile(everything[file.path], file.content)) {
      throw new Error(`Two different files want the path ${file.path}.`)
    }
    everything[file.path] = file.content
  }
  return everything
}

export function ExportView() {
  const blueprint = useWorkspace((state) => state.blueprint)
  const select = useWorkspace((state) => state.select)
  const [openPath, setOpenPath] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  const compiled = useMemo(() => {
    if (!blueprint) return undefined
    try {
      return compileBlueprint(blueprint)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [blueprint])

  // The same scan the push runs, over the same files (P7-06). An archive is where a project
  // leaves this browser, and a key in it travels wherever the archive does — usually to
  // somebody else. A set of files that cannot even be assembled has its own error path, so a
  // scan that cannot run reports nothing rather than blocking on a problem it did not find.
  const findings = useMemo(() => {
    if (!blueprint || !compiled || 'error' in compiled) return []
    try {
      return scanForSecrets(assembleArchive(blueprint, compiled.files))
    } catch {
      return []
    }
  }, [blueprint, compiled])

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

  const byPath = (a: GeneratedFile, b: GeneratedFile) => (a.path < b.path ? -1 : 1)
  const shared = compiled.files.filter((file) => file.owner === 'shared').sort(byPath)

  // A file appears under exactly one heading. "Shared" is a real category, because several
  // harnesses read the same AGENTS.md; listing it under each of them instead credited
  // Claude Code with writing files it never writes, on the one screen whose job is to say
  // which artifact produced which file.
  const groups: { title: string; files: GeneratedFile[] }[] = [
    { title: 'Source', files: sourceFiles },
    ...compiled.targets.map((target) => ({
      title: HARNESS_LABELS[target],
      files: compiled.files.filter((file) => file.owner === target).sort(byPath),
    })),
    ...(shared.length > 0 ? [{ title: 'Read by several harnesses', files: shared }] : []),
  ]

  const open = groups.flatMap((group) => group.files).find((file) => file.path === openPath)

  const blockedBySecret = blockedBySecrets(findings, accepted)

  const download = async () => {
    setBusy(true)
    try {
      const everything = assembleArchive(blueprint, compiled.files)
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
          <Badge variant="outline">
            {groups.reduce((total, group) => total + group.files.length, 0)} files
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={busy || errors.length > 0 || blockedBySecret}
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

        {findings.length > 0 ? (
          <div className="border-danger shrink-0 border-b p-3">
            <SecretFindings
              findings={findings}
              accepted={accepted}
              onToggle={(id) =>
                setAccepted((current) => {
                  const next = new Set(current)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }
              consequence="An archive travels wherever it is sent, and this one is about to leave the browser."
            />
          </div>
        ) : null}

        {open ? (
          <>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{open.path}</span>
              <Badge variant="outline">{formatBytes(byteLength(open.content))}</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // The clipboard API is unavailable on any non-secure origin; showing the
                  // path beats a button that silently does nothing.
                  if (!navigator.clipboard) {
                    toast.error('This browser will not let the page copy', {
                      description: open.path,
                    })
                    return
                  }
                  void navigator.clipboard
                    .writeText(open.path)
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
                disabled={errors.length > 0}
                onClick={() =>
                  downloadBlob(
                    typeof open.content === 'string'
                      ? new Blob([open.content], { type: 'text/plain;charset=utf-8' })
                      : new Blob([new Uint8Array(open.content)]),
                    open.path.split('/').at(-1) ?? 'file.txt',
                  )
                }
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

            {typeof open.content === 'string' ? (
              <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                {open.content}
              </pre>
            ) : (
              <p className="text-muted-foreground p-3 text-sm">
                This file is not text. It is copied from the Blueprint byte for byte; save it to see
                it.
              </p>
            )}
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
