/**
 * Text and bytes.
 *
 * A project is text almost everywhere, and the parts that are not — a diagram beside a skill,
 * a font, a screenshot — still have to survive a read, a write, a ZIP round trip and a commit
 * unchanged. The Blueprint model stays JSON-serializable (it goes through ChangeSets, undo
 * history and IndexedDB), so a binary resource carries base64 text plus an `encoding` field
 * rather than a `Uint8Array`. Only the file system sees the real bytes.
 */

import type { ProjectFile } from './virtual-fs'

const encoder = new TextEncoder()

/** Decodes as UTF-8, or returns undefined when the bytes are not text. */
export function decodeUtf8(bytes: Uint8Array): string | undefined {
  // Valid UTF-8 can still be a binary format, so reject a NUL byte first: no text file
  // has one, and plenty of binary formats decode cleanly without it.
  if (bytes.includes(0)) return undefined
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
  return text
}

/** Size on disk, whether the content is text or bytes. */
export function byteLength(content: ProjectFile): number {
  return typeof content === 'string' ? encoder.encode(content).length : content.length
}

export function encodeUtf8(text: string): Uint8Array {
  return encoder.encode(text)
}

/**
 * Base64, chunked so a large asset does not blow the argument limit of `String.fromCharCode`.
 * `btoa` and `atob` are in every browser and in Node 22, so no Buffer and no dependency.
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function sameBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false
  return true
}

/** True when two file contents are the same file: text to text, or byte for byte. */
export function sameFile(a: ProjectFile | undefined, b: ProjectFile | undefined): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b
  return sameBytes(a, b)
}
