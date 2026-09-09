/**
 * A tiny deterministic Markdown builder. Nothing here formats prose; it only assembles
 * blocks so that every emitter produces the same spacing (one blank line between blocks,
 * exactly one trailing newline, LF only).
 */
export class Markdown {
  private readonly blocks: string[] = []

  heading(level: 1 | 2 | 3 | 4, text: string): this {
    return this.block(`${'#'.repeat(level)} ${text.trim()}`)
  }

  paragraph(text: string | undefined): this {
    const trimmed = text?.trim()
    if (trimmed) this.block(trimmed)
    return this
  }

  /** Adds a block verbatim (already-formatted Markdown such as an artifact body). */
  raw(text: string | undefined): this {
    const trimmed = text?.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
    if (trimmed) this.block(trimmed)
    return this
  }

  bullets(items: readonly string[], marker = '-'): this {
    const lines = items.map((item) => `${marker} ${indentContinuation(item)}`)
    if (lines.length > 0) this.block(lines.join('\n'))
    return this
  }

  numbered(items: readonly string[]): this {
    // CommonMark puts the content column of "1. " at 3, so nested blocks need 3 spaces or
    // they end the list item and restart the numbering.
    const lines = items.map((item, index) => `${index + 1}. ${indentContinuation(item, 3)}`)
    if (lines.length > 0) this.block(lines.join('\n'))
    return this
  }

  /** A GitHub-flavoured table. Cells are escaped so a `|` in content cannot break the row. */
  table(headers: readonly string[], rows: readonly (readonly string[])[]): this {
    if (rows.length === 0) return this
    const line = (cells: readonly string[]) => `| ${cells.map(escapeCell).join(' | ')} |`
    const separator = `| ${headers.map(() => '---').join(' | ')} |`
    return this.block([line(headers), separator, ...rows.map(line)].join('\n'))
  }

  /** Appends another builder's content as one block. */
  append(other: Markdown): this {
    return this.raw(other.blocks.join('\n\n'))
  }

  get isEmpty(): boolean {
    return this.blocks.length === 0
  }

  block(text: string): this {
    const trimmed = text.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
    if (trimmed.length > 0) this.blocks.push(trimmed)
    return this
  }

  render(): string {
    return this.blocks.length === 0 ? '' : `${this.blocks.join('\n\n')}\n`
  }
}

/** Continuation lines of a list item are indented so the item stays one list entry. */
function indentContinuation(item: string, width = 2): string {
  const indent = ' '.repeat(width)
  return item
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join('\n')
}

function escapeCell(text: string): string {
  return text.replace(/\r\n?/g, ' ').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()
}

/** First sentence of a text, for short descriptions. Falls back to the whole text. */
export function firstSentence(text: string | undefined): string {
  if (!text) return ''
  const match = /^(.*?[.!?])(\s|$)/s.exec(text.trim())
  return (match?.[1] ?? text.trim()).replace(/\s+/g, ' ')
}

/** `a`, `a and b`, `a, b and c`. */
export function joinList(items: readonly string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`
}

export function code(text: string): string {
  return `\`${text}\``
}

/** One line of a definition-style list: `**Label:** value`. */
export function labelled(label: string, value: string): string {
  return `**${label}:** ${value}`
}
