/**
 * The draft Blueprint behind `/new`.
 *
 * Creating a project asks one question — what is this? — and then opens the workspace on the
 * answer. Everything a Blueprint is made of is added there, where the tree, the inspector,
 * "new from template" and the health bar all exist; a second, worse artifact editor inside a
 * wizard was a second thing to keep working (P9-03).
 *
 * The draft is a real Blueprint from the first keystroke: it goes through the same schemas
 * the workspace uses, which is why nothing created here can be something the editor would
 * then refuse.
 */
import {
  type Blueprint,
  createEmptyBlueprint,
  type HarnessId,
  isSlug,
  slugify,
} from '@agent-blueprint/core'

import { withOnlyTargets } from '@/lib/targets'

export const DRAFT_PLACEHOLDER_NAME = 'Untitled Blueprint'

/** The two harnesses with a complete adapter; the others are one checkbox away. */
export const DEFAULT_TARGETS: readonly HarnessId[] = ['claude-code', 'codex']

export function emptyDraft(): Blueprint {
  return setTargets(
    createEmptyBlueprint({ id: 'untitled-blueprint', name: DRAFT_PLACEHOLDER_NAME }),
    DEFAULT_TARGETS,
  )
}

const FALLBACK_ID = 'untitled-blueprint'

/** True while the id is still whatever the name produced, so it is safe to keep deriving it. */
export function idFollowsName(draft: Blueprint): boolean {
  return draft.id === (slugify(draft.name) || FALLBACK_ID)
}

/**
 * Name, id and description.
 *
 * The id follows the name until the author edits it, and then it stops: an id the author
 * chose is not something a later typo fix in the name should quietly undo. Whether it was
 * authored is derived rather than tracked, by asking whether the current id is still exactly
 * what the current name would produce.
 *
 * Neither field can leave the draft invalid. An id that is not yet a slug (mid-typing, or
 * with capitals) is not written; the field keeps the text and the Blueprint keeps the last
 * good value, which is the same bargain the artifact forms make.
 */
export function setIdentity(
  draft: Blueprint,
  patch: { name?: string; id?: string; description?: string },
): Blueprint {
  const authored = !idFollowsName(draft)
  const name = patch.name ?? draft.name
  const derived = slugify(name) || FALLBACK_ID

  const id =
    patch.id !== undefined
      ? isSlug(patch.id)
        ? patch.id
        : draft.id
      : authored
        ? draft.id
        : derived

  return {
    ...draft,
    name: name.trim() === '' ? DRAFT_PLACEHOLDER_NAME : name,
    id,
    ...(patch.description !== undefined ? { description: patch.description } : {}),
  }
}

/**
 * Which harnesses a Blueprint compiles for. A new project keeps the defaults; changing them
 * is the command palette's job and the compatibility view's, and the rule for how lives in
 * `lib/targets` so all three change the same thing.
 */
export function setTargets(draft: Blueprint, enabled: readonly HarnessId[]): Blueprint {
  return { ...draft, targets: withOnlyTargets(draft, enabled) }
}

/** What the draft still needs before it can be created, or undefined when it is ready. */
export function blockingReason(draft: Blueprint): string | undefined {
  return draft.name.trim() === '' || draft.name === DRAFT_PLACEHOLDER_NAME
    ? 'Give the Blueprint a name.'
    : undefined
}
