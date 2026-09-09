'use client'

/**
 * Files that ship next to SKILL.md.
 *
 * A skill is meant to travel with what it needs, and its references, scripts and assets are
 * part of it. They already round-trip through the project format; this is where they can be
 * written without opening the file by hand.
 */
import { SKILL_RESOURCE_KINDS } from '@agent-blueprint/core'
import { PlusIcon } from 'lucide-react'

import { Field, SelectField, TextAreaField, TextField } from '@/components/editors/fields'
import { Button } from '@/components/ui/button'

type Resource = { path: string; kind: (typeof SKILL_RESOURCE_KINDS)[number]; content: string }

export function ResourcesField({
  entity,
  update,
}: {
  entity: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const resources = (entity['resources'] ?? []) as Resource[]

  const set = (index: number, patch: Partial<Resource>) => {
    update({
      resources: resources.map((resource, position) =>
        position === index ? { ...resource, ...patch } : resource,
      ),
    })
  }

  return (
    <Field
      label="Resources"
      help="Files written beside SKILL.md, so the skill is self-contained wherever it is compiled."
    >
      <div className="flex flex-col gap-3">
        {resources.map((resource, index) => (
          // Keyed by position: resources have no id, and the labels are numbered to match.
          <div key={index} className="flex flex-col gap-2 rounded-md border p-3">
            <TextField
              label={`Resource ${index + 1} path`}
              mono
              value={resource.path}
              onChange={(path) => set(index, { path })}
              help="Relative to the skill's own directory, such as references/patterns.md."
            />
            <SelectField
              label={`Resource ${index + 1} kind`}
              value={resource.kind}
              options={SKILL_RESOURCE_KINDS}
              onChange={(kind) => set(index, { kind })}
            />
            <TextAreaField
              label={`Resource ${index + 1} content`}
              mono
              rows={6}
              value={resource.content}
              onChange={(content) => set(index, { content })}
            />
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                update({ resources: resources.filter((_, position) => position !== index) })
              }
            >
              Remove resource {index + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            update({
              resources: [
                ...resources,
                {
                  path: `references/note-${resources.length + 1}.md`,
                  kind: 'reference',
                  content: '',
                },
              ],
            })
          }
        >
          <PlusIcon className="size-3" />
          Add resource
        </Button>
      </div>
    </Field>
  )
}
