/**
 * Deterministic text utilities shared by the semantic rules.
 *
 * These are heuristics, not linguistics: they exist so that "this responsibility has no
 * matching skill" and "these two sentences contradict each other" are computed the same way
 * on every machine and in every run. Nothing here calls a model, and every function is a
 * pure function of its input string.
 */

/**
 * Function words carry no topic. Removing them keeps keyword overlap about the subject
 * matter rather than about English grammar.
 */
const STOP_WORD_LIST = [
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'either',
  'every',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'no',
  'nor',
  'not',
  'of',
  'off',
  'on',
  'once',
  'or',
  'other',
  'our',
  'ours',
  'out',
  'over',
  'own',
  'per',
  'same',
  'she',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
]

export const STOP_WORDS: ReadonlySet<string> = new Set(STOP_WORD_LIST)

/**
 * Strip Markdown decoration so that sentences read as prose. Code spans keep their text
 * (a rule about `dotnet test` is a rule about dotnet test) but fences are dropped: their
 * contents are examples, not statements.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>\n]{1,200}>/g, ' ')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/’/g, "'")
    .replace(/[‘“”]/g, '"')
}

const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*)$/
const LIST_MARKER_RE = /^\s*(?:[-*+]|\d{1,3}[.)])\s+/
const BLOCKQUOTE_RE = /^\s*>+\s?/

/** A sentence together with the nearest Markdown heading above it. */
export interface ContextualSentence {
  sentence: string
  /** Nearest heading above the sentence, lower-cased; empty when there is none. */
  heading: string
}

/**
 * Split Markdown into sentences, remembering the heading each one sits under.
 *
 * The heading matters for the contradiction heuristic: a sentence under "Counterexamples"
 * states what *not* to do and must not be read as a rule.
 */
export function extractSentences(markdown: string): ContextualSentence[] {
  const out: ContextualSentence[] = []
  let heading = ''
  for (const rawLine of stripMarkdown(markdown).split('\n')) {
    const headingMatch = HEADING_RE.exec(rawLine)
    if (headingMatch) {
      heading = (headingMatch[1] ?? '').trim().toLowerCase()
      continue
    }
    const line = rawLine.replace(BLOCKQUOTE_RE, '').replace(LIST_MARKER_RE, '')
    for (const sentence of splitSentences(line)) out.push({ sentence, heading })
  }
  return out
}

/**
 * Sentence boundaries are `.`, `!`, `?` or `;` followed by whitespace or end of input, so
 * that `.csproj`, `Should().Be()` and version numbers do not split a sentence.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((part) =>
      part
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.!?;]+$/, '')
        .trim(),
    )
    .filter((part) => part.length > 0)
}

const TOKEN_RE = /[a-z0-9]+/g

/** Lower-case alphanumeric runs. Hyphens and punctuation separate tokens. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? []
}

const DOUBLED_CONSONANT_RE = /([bcdfgklmnprstvz])\1$/

/**
 * Suffix stripping in the spirit of the first Porter step: enough to make "tests",
 * "testing" and "tested" the same token, not enough to be a real stemmer.
 */
export function stem(token: string): string {
  let word = token
  if (word.length > 4 && word.endsWith('ies')) {
    word = `${word.slice(0, -3)}y`
  } else if (word.length > 4 && /(?:sses|ches|shes|xes|zes|ses)$/.test(word)) {
    word = word.slice(0, -2)
  } else if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    word = word.slice(0, -1)
  } else if (word.length > 5 && word.endsWith('ing')) {
    word = undouble(word.slice(0, -3))
  } else if (word.length > 4 && word.endsWith('ed')) {
    word = undouble(word.slice(0, -2))
  }
  return word.endsWith('i') ? `${word.slice(0, -1)}y` : word
}

function undouble(word: string): string {
  return DOUBLED_CONSONANT_RE.test(word) ? word.slice(0, -1) : word
}

/** Content tokens of a text: stop words removed, everything stemmed. */
export function keywords(text: string): Set<string> {
  const out = new Set<string>()
  for (const token of tokenize(text)) {
    if (STOP_WORDS.has(token)) continue
    out.add(stem(token))
  }
  return out
}

export function intersect<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): T[] {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  return Array.from(small).filter((item) => large.has(item))
}

/** |A ∩ B| / |A ∪ B|; 0 when both sets are empty. */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 || b.size === 0) return 0
  const shared = intersect(a, b).length
  return shared / (a.size + b.size - shared)
}

export type Polarity = 'positive' | 'negative'

export interface ModalMatch {
  modal: string
  polarity: Polarity
  /** Index just past the modal, where the noun phrase starts. */
  end: number
}

/** Longest form first so that "must not" wins over "must" at the same position. */
const MODALS: readonly { text: string; polarity: Polarity }[] = [
  { text: 'must not', polarity: 'negative' },
  { text: "mustn't", polarity: 'negative' },
  { text: 'should not', polarity: 'negative' },
  { text: "shouldn't", polarity: 'negative' },
  { text: 'do not', polarity: 'negative' },
  { text: "don't", polarity: 'negative' },
  { text: 'never', polarity: 'negative' },
  { text: 'always', polarity: 'positive' },
  { text: 'must', polarity: 'positive' },
  { text: 'should', polarity: 'positive' },
  { text: 'only', polarity: 'positive' },
]

/** The first modal in the sentence, or `undefined` when the sentence states no obligation. */
export function findModal(sentence: string): ModalMatch | undefined {
  const haystack = sentence.toLowerCase()
  let best: ModalMatch | undefined
  for (const modal of MODALS) {
    const index = indexOfWord(haystack, modal.text)
    if (index === -1) continue
    const candidate = {
      modal: modal.text,
      polarity: modal.polarity,
      end: index + modal.text.length,
    }
    if (!best || index < best.end - best.modal.length) best = candidate
  }
  return best
}

function indexOfWord(haystack: string, needle: string): number {
  let from = 0
  for (;;) {
    const index = haystack.indexOf(needle, from)
    if (index === -1) return -1
    const before = index === 0 ? ' ' : haystack[index - 1]
    const after = haystack[index + needle.length] ?? ' '
    if (!isWordChar(before) && !isWordChar(after)) return index
    from = index + 1
  }
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[a-z0-9']/.test(char)
}

/**
 * The subject of an obligation: everything between the modal and the first punctuation,
 * as content tokens. Cutting at punctuation keeps "Never claim code works, compiles, …"
 * about claiming code works rather than about the whole enumeration.
 */
export function nounPhraseTokens(sentence: string, modal: ModalMatch): Set<string> {
  const rest = sentence.slice(modal.end)
  const cut = rest.search(/[,;:()[\]{}]/)
  return keywords(cut === -1 ? rest : rest.slice(0, cut))
}
