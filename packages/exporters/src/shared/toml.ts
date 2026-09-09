/**
 * A minimal deterministic TOML writer for Codex configuration.
 *
 * Only what the adapters need: string, number, boolean, arrays of scalars, and nested
 * tables. Keys keep insertion order (the caller builds objects in the order it wants to
 * read them), scalars of a table are written before its sub-tables, and every file ends
 * with exactly one newline.
 */
export type TomlScalar = string | number | boolean
export type TomlValue = TomlScalar | TomlScalar[] | TomlTable
export interface TomlTable {
  [key: string]: TomlValue | undefined
}

const BARE_KEY_RE = /^[A-Za-z0-9_-]+$/

export function toToml(table: TomlTable): string {
  const lines: string[] = []
  writeTable(table, [], lines)
  const text = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '')
  return text.length === 0 ? '' : `${text}\n`
}

function writeTable(table: TomlTable, path: string[], lines: string[]): void {
  const scalars: [string, TomlValue][] = []
  const tables: [string, TomlTable][] = []
  for (const [key, value] of Object.entries(table)) {
    if (value === undefined) continue
    if (isTable(value)) tables.push([key, value])
    else scalars.push([key, value])
  }

  if (path.length > 0 && (scalars.length > 0 || tables.length === 0)) {
    lines.push(`[${path.map(formatKey).join('.')}]`)
  }
  for (const [key, value] of scalars) lines.push(`${formatKey(key)} = ${formatValue(value)}`)
  if (scalars.length > 0 || path.length > 0) lines.push('')

  for (const [key, value] of tables) writeTable(value, [...path, key], lines)
}

function isTable(value: TomlValue): value is TomlTable {
  return typeof value === 'object' && !Array.isArray(value)
}

function formatKey(key: string): string {
  return BARE_KEY_RE.test(key) ? key : formatString(key)
}

function formatValue(value: TomlValue): string {
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return formatString(value)
  // Tables become [section] headers in writeTable and never appear as an inline value.
  throw new Error('toToml: a nested table cannot be written as a value')
}

function formatString(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n')
  if (!normalized.includes('\n')) return `"${escapeBasic(normalized)}"`
  // Multi-line basic string: TOML trims the newline right after the opening delimiter, so
  // starting with one keeps the first line of the value on its own line in the file.
  const body = normalized.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')
  return `"""\n${body}"""`
}

/**
 * Escapes a basic string. Written as a loop rather than a regular expression because the
 * character class would have to contain literal control characters.
 */
function escapeBasic(value: string): string {
  let out = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (character === '\\') out += '\\\\'
    else if (character === '"') out += '\\"'
    else if (character === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f) out += `\\u${code.toString(16).padStart(4, '0')}`
    else out += character
  }
  return out
}
