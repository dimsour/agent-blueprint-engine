/**
 * Section snippets for the source editor.
 *
 * The compiler and the validation rules both look for particular headings: a skill without a
 * Verification section is a warning, and the harness adapters lift Instructions and Examples
 * into their own formats. Typing those headings from memory is exactly the kind of thing an
 * editor should offer, so it does.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import type { CompletionSource } from '@codemirror/autocomplete'

interface Section {
  heading: string
  detail: string
  body: string
}

const SECTIONS: readonly Section[] = [
  {
    heading: 'Instructions',
    detail: 'What to do, step by step',
    body: '1. ${First step}\n2. ${Second step}',
  },
  {
    heading: 'When to use',
    detail: 'The situation this applies to',
    body: '${Use this when…}',
  },
  {
    heading: 'Verification',
    detail: 'How to know it worked',
    body: '- [ ] ${What must be true}',
  },
  { heading: 'Examples', detail: 'A case that shows the shape', body: '```\n${example}\n```' },
  {
    heading: 'Counterexamples',
    detail: 'A case that looks right and is not',
    body: '```\n${counterexample}\n```',
  },
  { heading: 'Rationale', detail: 'Why this exists', body: '${Because…}' },
  {
    heading: 'Edge cases',
    detail: 'What to watch for',
    body: '- ${The case that catches people out}',
  },
]

/**
 * Completes a Markdown heading into a whole section. Offered only where a heading can start,
 * so it never interrupts a sentence.
 */
export const sectionSnippets: CompletionSource = (context) => {
  const match = context.matchBefore(/^#{1,3}\s*\w*/)
  if (!match || (match.from === match.to && !context.explicit)) return null

  return {
    from: match.from,
    options: SECTIONS.map((section) =>
      snippetCompletion(`## ${section.heading}\n\n${section.body}\n`, {
        label: `## ${section.heading}`,
        detail: section.detail,
        type: 'text',
      }),
    ),
  }
}
