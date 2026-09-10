/**
 * Frontmatter for generated Markdown. Unlike the project format in core, generated files
 * choose their key order per harness, so this takes an already-ordered object and drops
 * empty values.
 */
import { toYaml } from '@agent-blueprint/core'

import { withHeader } from './header'

/** One level of nesting is enough for every harness: OpenCode's `permission` is the deepest. */
export type FrontmatterMap = Record<string, string | Record<string, string>>

export type FrontmatterValue = string | number | boolean | string[] | FrontmatterMap

export type Frontmatter = Record<string, FrontmatterValue | undefined>

function prune(data: Frontmatter): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.trim().length === 0) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
      continue
    out[key] = value
  }
  return out
}

/**
 * `---\n<yaml>---\n\n<header comment>\n\n<body>\n`. The generated-file header goes inside the
 * body because YAML frontmatter has to start at byte 0.
 */
export function markdownWithFrontmatter(
  data: Frontmatter,
  body: string,
  sourcePath: string,
): string {
  const pruned = prune(data)
  const head = Object.keys(pruned).length === 0 ? '---\n---\n' : `---\n${toYaml(pruned)}---\n`
  return `${head}\n${withHeader(sourcePath, body).replace(/\s+$/, '')}\n`
}
