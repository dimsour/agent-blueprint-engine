/**
 * Entity identifiers are slugs.
 *
 * A slug is kebab-case, unique per entity kind, and doubles as the file name on disk and
 * the cross-reference key between entities. Renaming a slug is an explicit refactor
 * (see `renameEntity`), never an implicit side effect of changing a display name.
 *
 * The 64-character limit and the character set match the Agent Skills specification,
 * which requires a skill's `name` to equal its directory name.
 */
export type Slug = string

export const SLUG_MAX_LENGTH = 64
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Not a type predicate on purpose: `Slug` is an alias of `string`, so a predicate would
 * narrow the false branch to `never`.
 */
export function isSlug(value: unknown): boolean {
  return typeof value === 'string' && value.length <= SLUG_MAX_LENGTH && SLUG_RE.test(value)
}

/**
 * Derive a slug from free text ("xUnit Testing!" → "xunit-testing").
 * Returns an empty string when nothing usable remains; callers must handle that.
 */
export function slugify(text: string): Slug {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
}

/**
 * Produce a slug that is not in `taken`, appending `-2`, `-3`, … when needed.
 * Falls back to `fallback` when `text` slugifies to nothing.
 */
export function uniqueSlug(text: string, taken: Iterable<string>, fallback = 'item'): Slug {
  const base = slugify(text) || fallback
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length)}${suffix}`
    if (!used.has(candidate)) return candidate
  }
}
