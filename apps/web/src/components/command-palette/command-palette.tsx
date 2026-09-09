'use client'

/**
 * The command palette.
 *
 * It is the map of the product as much as a way to run things, so an action that is not
 * built yet is listed and disabled with the reason rather than hidden — the same rule the
 * top bar follows. Everything that is enabled here does the real thing through the store,
 * never a shortcut around it.
 */
import {
  ENTITY_KIND_INFO,
  ENTITY_KINDS,
  type EntityKind,
  getCollection,
  summarizeDiagnostics,
} from '@agent-blueprint/core'
import { Command } from 'cmdk'
import {
  CheckIcon,
  CloudUploadIcon,
  DownloadIcon,
  EyeIcon,
  FileCodeIcon,
  PlusIcon,
  RedoIcon,
  SaveIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UndoIcon,
} from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/overlays'
import { hasPreview } from '@/lib/artifact-source'
import { useModifierLabel } from '@/lib/shortcuts'
import { useWorkspace, workspaceHistory } from '@/lib/state/workspace-store'

/** The name a freshly created artifact gets, before the author renames it. */
export function newArtifactName(kind: EntityKind): string {
  return `New ${ENTITY_KIND_INFO[kind].label.toLowerCase()}`
}

const HEADING =
  '[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase'

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group heading={heading} className={HEADING}>
      {children}
    </Command.Group>
  )
}

function Item({
  icon,
  label,
  value,
  hint,
  keywords,
  disabled,
  onSelect,
}: {
  icon: ReactNode
  label: string
  /** Unique key for cmdk; defaults to the label. Two artifacts may share a name. */
  value?: string
  hint?: string
  keywords?: string[]
  disabled?: boolean
  onSelect?: () => void
}) {
  return (
    <Command.Item
      value={value ?? label}
      {...(keywords ? { keywords } : {})}
      disabled={disabled ?? false}
      onSelect={onSelect ?? (() => {})}
      className="data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[disabled=true]:cursor-default data-[disabled=true]:opacity-50"
    >
      <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="text-muted-foreground shrink-0 text-xs">{hint}</span> : null}
    </Command.Item>
  )
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const selection = useWorkspace((state) => state.selection)
  const dirty = useWorkspace((state) => state.dirty)
  const create = useWorkspace((state) => state.create)
  const select = useWorkspace((state) => state.select)
  const setArtifactTab = useWorkspace((state) => state.setArtifactTab)
  const updateBlueprint = useWorkspace((state) => state.updateBlueprint)
  const save = useWorkspace((state) => state.save)
  const flushPending = useWorkspace((state) => state.flushPending)
  const mod = useModifierLabel()

  const artifacts = useMemo(() => {
    if (!blueprint) return []
    return ENTITY_KINDS.flatMap((kind) =>
      getCollection(blueprint, kind).map((entity) => ({ kind, id: entity.id, name: entity.name })),
    )
  }, [blueprint])

  if (!blueprint) return null

  /** Every action closes the palette; none of them leave it open behind a change. */
  const run = (action: () => void) => () => {
    action()
    onOpenChange(false)
  }

  const validate = () => {
    void flushPending().then(() => {
      const counts = summarizeDiagnostics(useWorkspace.getState().diagnostics)
      const total = counts.errors + counts.warnings + counts.infos
      toast.success(total === 0 ? 'No findings' : `${total} findings`, {
        description:
          total === 0
            ? 'This Blueprint is clean.'
            : `${counts.errors} errors, ${counts.warnings} warnings, ${counts.infos} suggestions.`,
      })
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command label="Command palette" loop className="flex max-h-[60vh] flex-col">
          <Command.Input
            placeholder="Type a command or search for an artifact…"
            aria-label="Command"
            className="placeholder:text-muted-foreground h-11 w-full shrink-0 border-b bg-transparent px-4 text-sm outline-none"
          />
          <Command.List className="min-h-0 flex-1 overflow-auto p-1.5">
            <Command.Empty className="text-muted-foreground px-2 py-6 text-center text-sm">
              Nothing matches that.
            </Command.Empty>

            <Group heading="Create">
              {ENTITY_KINDS.map((kind) => (
                <Item
                  key={kind}
                  icon={<PlusIcon />}
                  label={`Create ${ENTITY_KIND_INFO[kind].label}`}
                  keywords={['new', 'add']}
                  onSelect={run(() => {
                    create(kind, newArtifactName(kind))
                  })}
                />
              ))}
            </Group>

            {selection ? (
              <Group heading="This artifact">
                <Item
                  icon={<SlidersHorizontalIcon />}
                  label="Show the form"
                  onSelect={run(() => setArtifactTab('visual'))}
                />
                <Item
                  icon={<FileCodeIcon />}
                  label="Show the project file"
                  keywords={['markdown', 'yaml', 'source']}
                  onSelect={run(() => setArtifactTab('source'))}
                />
                {hasPreview(selection) ? (
                  <Item
                    icon={<EyeIcon />}
                    label="Show the preview"
                    hint={`${mod}P`}
                    onSelect={run(() => setArtifactTab('preview'))}
                  />
                ) : null}
              </Group>
            ) : null}

            <Group heading="Verify">
              <Item icon={<CheckIcon />} label="Validate" onSelect={run(validate)} />
            </Group>

            <Group heading="Blueprint">
              <Item
                icon={<SaveIcon />}
                label="Save"
                hint={`${mod}S`}
                disabled={!dirty}
                onSelect={run(() => void save())}
              />
              <Item
                icon={<UndoIcon />}
                label="Undo"
                hint={`${mod}Z`}
                disabled={!workspaceHistory.canUndo}
                onSelect={run(workspaceHistory.undo)}
              />
              <Item
                icon={<RedoIcon />}
                label="Redo"
                disabled={!workspaceHistory.canRedo}
                onSelect={run(workspaceHistory.redo)}
              />
            </Group>

            <Group heading="Targets">
              {blueprint.targets.map((target) => (
                <Item
                  key={target.harnessId}
                  icon={<CheckIcon />}
                  label={`${target.enabled ? 'Disable' : 'Enable'} ${target.harnessId}`}
                  keywords={['harness', 'target', 'switch']}
                  onSelect={run(() => {
                    updateBlueprint({
                      targets: blueprint.targets.map((candidate) =>
                        candidate.harnessId === target.harnessId
                          ? { ...candidate, enabled: !candidate.enabled }
                          : candidate,
                      ),
                    })
                  })}
                />
              ))}
            </Group>

            <Group heading="Deliver">
              <Item
                icon={<DownloadIcon />}
                label="Export ZIP"
                hint="not built yet"
                disabled
                keywords={['download', 'compile']}
              />
              <Item
                icon={<FileCodeIcon />}
                label="Browse generated files"
                hint="not built yet"
                disabled
              />
              <Item
                icon={<CloudUploadIcon />}
                label="Push to GitHub"
                hint="not built yet"
                disabled
              />
              <Item
                icon={<SparklesIcon />}
                label="AI actions"
                hint="needs an AI endpoint"
                disabled
                keywords={['generate', 'improve', 'evaluate', 'contradictions']}
              />
            </Group>

            <Group heading="Go to">
              {artifacts.map((artifact) => (
                <Item
                  key={`${artifact.kind}:${artifact.id}`}
                  value={`${artifact.name} ${artifact.kind} ${artifact.id}`}
                  icon={<span aria-hidden>·</span>}
                  label={artifact.name}
                  hint={ENTITY_KIND_INFO[artifact.kind].label}
                  onSelect={run(() => select({ kind: artifact.kind, id: artifact.id }))}
                />
              ))}
            </Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
