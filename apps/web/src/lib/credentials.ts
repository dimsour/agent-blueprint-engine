/**
 * The only module in this app that touches a secret.
 *
 * That is the point of it. Keys live in web storage under `ab:credentials:*`, and if more than
 * one place could read or write that namespace, "no credential reaches a Blueprint, an export
 * or a log" would be a hope rather than a rule. Everything else asks for a key here and gets a
 * string; nothing else knows where it was kept (docs/08-security.md).
 *
 * Where it is kept is the user's choice and it is a real one. `sessionStorage` is gone when the
 * tab closes, which is the right default for something pasted into a browser with no server.
 * `localStorage` survives, which is convenient and means anyone with this browser profile —
 * including every extension with storage access — can read it. The UI says exactly that before
 * the key is written, never after.
 */

export const CREDENTIAL_KEYS = {
  ai: 'ab:credentials:ai',
  github: 'ab:credentials:github',
} as const

export type CredentialName = keyof typeof CREDENTIAL_KEYS

export type CredentialStorage = 'session' | 'local'

export const STORAGE_WARNING =
  'The key will stay in this browser profile until you remove it. Anyone with access to this profile, and any browser extension with storage access, can read it. Use a key with the smallest scope you can, and remove it from Settings when you are done.'

/**
 * Web storage throws rather than returning null in a locked-down browser, and is absent
 * during server rendering. Neither is a reason to break the page.
 */
function area(where: CredentialStorage): Storage | undefined {
  try {
    return where === 'local' ? globalThis.localStorage : globalThis.sessionStorage
  } catch {
    return undefined
  }
}

export interface StoredCredential {
  value: string
  where: CredentialStorage
}

/** The credential and where it was found. Session wins: it is the more deliberate place. */
export function readCredential(name: CredentialName): StoredCredential | undefined {
  const key = CREDENTIAL_KEYS[name]
  for (const where of ['session', 'local'] as const) {
    try {
      const value = area(where)?.getItem(key)
      if (value) return { value, where }
    } catch {
      // A browser that refuses to read storage has no credential to give.
    }
  }
  return undefined
}

/** Write it in one place and remove it from the other, so there is never a stale second copy. */
export function writeCredential(
  name: CredentialName,
  value: string,
  where: CredentialStorage,
): void {
  const key = CREDENTIAL_KEYS[name]
  const other = where === 'local' ? 'session' : 'local'
  try {
    area(other)?.removeItem(key)
    if (value) area(where)?.setItem(key, value)
    else area(where)?.removeItem(key)
  } catch {
    // Nothing to do: the caller is told what is stored by reading it back.
  }
}

export function forgetCredential(name: CredentialName): void {
  for (const where of ['session', 'local'] as const) {
    try {
      area(where)?.removeItem(CREDENTIAL_KEYS[name])
    } catch {
      // Already unreachable, which is the state we wanted.
    }
  }
}

/** The Forget action in Settings: every credential this app knows how to keep. */
export function forgetAllCredentials(): void {
  for (const name of Object.keys(CREDENTIAL_KEYS) as CredentialName[]) forgetCredential(name)
}

/**
 * What to show instead of the key. There is no reveal: a key that can be shown can be
 * shoulder-read, screen-shared and screenshotted, and the user already has it somewhere else.
 */
export function maskCredential(value: string): string {
  if (value.length <= 8) return '•'.repeat(value.length)
  return `${value.slice(0, 3)}${'•'.repeat(Math.min(24, value.length - 7))}${value.slice(-4)}`
}
