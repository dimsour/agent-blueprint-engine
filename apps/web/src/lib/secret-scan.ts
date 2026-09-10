/**
 * Looking for a credential in what is about to be published.
 *
 * Nothing in this app puts a key into a Blueprint — there is no field for one, and the
 * credential module is the only code that touches web storage for secrets (docs/08-security.md).
 * But users write free text, and a key pasted into a skill body while debugging is a real
 * thing that happens. Publishing a repository is the moment that stops being recoverable, so
 * the files are read once before they leave.
 *
 * Two decisions about how this behaves, both deliberate:
 *
 * - **It blocks, and can be overridden per finding.** These patterns match example keys and
 *   documentation as happily as real ones, and a scanner that cannot be overruled is a scanner
 *   people learn to route around. A finding says which file and which line; the user decides.
 * - **It never shows the value.** A finding carries a masked excerpt, so a screen share or a
 *   screenshot of this dialog does not become the leak the dialog exists to prevent.
 *
 * `packages/ai` carries its own patterns for redacting model output, which is a different job
 * on a different kind of text; they are deliberately not shared.
 */

export interface SecretPattern {
  kind: string
  pattern: RegExp
}

/** The shapes named in docs/08-security.md, plus the ones a Git host itself warns about. */
const PATTERNS: SecretPattern[] = [
  { kind: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { kind: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'Anthropic key', pattern: /\bsk-ant-[A-Za-z0-9_-]{12,}/g },
  { kind: 'OpenAI key', pattern: /\bsk-(?!ant-)[A-Za-z0-9_-]{16,}/g },
  { kind: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { kind: 'Private key', pattern: /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/g },
  {
    kind: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    kind: 'Assigned credential',
    pattern: /\b(?:api[-_]?key|secret|password|token)"?\s*[:=]\s*"?([\w.\-+/=]{16,})/gi,
  },
]

export interface SecretFinding {
  path: string
  /** One-based, so it reads the way an editor's gutter does. */
  line: number
  kind: string
  /** The line with the match masked. Safe to render; never the value itself. */
  excerpt: string
}

/**
 * Every match, in path then line order.
 *
 * A file is scanned line by line rather than whole, because a line number is what makes a
 * finding actionable and because a match spanning lines is not a credential.
 */
export function scanForSecrets(files: Record<string, string>): SecretFinding[] {
  const findings: SecretFinding[] = []

  for (const path of Object.keys(files).sort()) {
    const lines = (files[path] ?? '').split('\n')
    lines.forEach((line, index) => {
      for (const { kind, pattern } of PATTERNS) {
        pattern.lastIndex = 0
        const match = pattern.exec(line)
        if (!match) continue
        findings.push({ path, line: index + 1, kind, excerpt: mask(line, match[1] ?? match[0]) })
      }
    })
  }

  return findings
}

/**
 * Keeps enough of the line to recognise it and none of the secret.
 *
 * The first few characters stay because they are what tells someone whether this is their AWS
 * key or an example in a document, which is the judgement they are being asked to make.
 */
function mask(line: string, value: string): string {
  const visible = value.slice(0, 4)
  const masked = `${visible}${'•'.repeat(Math.min(12, Math.max(3, value.length - 4)))}`
  const excerpt = line.replace(value, masked).trim()
  return excerpt.length > 120 ? `${excerpt.slice(0, 117)}…` : excerpt
}
