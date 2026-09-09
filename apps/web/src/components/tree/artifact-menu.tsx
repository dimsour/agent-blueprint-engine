'use client'

/**
 * Rename, duplicate and delete, from the tree.
 *
 * These are the same three refactors the inspector offers, opening the same three dialogs.
 * The tree is where a person is when they realise a name is wrong, so making them select the
 * artifact and cross the window first is a tax on the most common correction there is.
 */
import { ENTITY_KIND_INFO, type EntityKind, getCollection } from '@agent-blueprint/core'
import { CopyIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DeleteDialog, duplicateIdFor, RenameDialog } from '@/components/inspector/dialogs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlays'
import { useWorkspace } from '@/lib/state/workspace-store'

export interface TreeArtifact {
  kind: EntityKind
  id: string
  name: string
}

export function ArtifactMenu({
  artifact,
  className,
}: {
  artifact: TreeArtifact
  className?: string
}) {
  const blueprint = useWorkspace((state) => state.blueprint)
  const upsert = useWorkspace((state) => state.upsert)
  const select = useWorkspace((state) => state.select)
  const [dialog, setDialog] = useState<'rename' | 'delete' | undefined>()

  if (!blueprint) return null
  const selection = { kind: artifact.kind, id: artifact.id }

  const duplicate = () => {
    const entity = getCollection(blueprint, artifact.kind).find((item) => item.id === artifact.id)
    if (!entity) return
    const taken = getCollection(blueprint, artifact.kind).map((item) => item.id)
    const id = duplicateIdFor(taken, artifact.id)
    upsert(artifact.kind, {
      ...(entity as unknown as Record<string, unknown>),
      id,
      name: `${entity.name} (copy)`,
    } as never)
    select({ kind: artifact.kind, id })
    toast.success(`Duplicated as ${id}`, {
      description: 'It points at what the original pointed at; nothing points at it yet.',
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={className}
            aria-label={`Actions for ${artifact.name}`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('rename')}>
            <PencilIcon className="size-3.5" />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate}>
            <CopyIcon className="size-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog('delete')}>
            <Trash2Icon className="text-danger size-3.5" />
            Delete {ENTITY_KIND_INFO[artifact.kind].label.toLowerCase()}…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === 'rename' ? (
        <RenameDialog selection={selection} open onOpenChange={() => setDialog(undefined)} />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDialog selection={selection} open onOpenChange={() => setDialog(undefined)} />
      ) : null}
    </>
  )
}
