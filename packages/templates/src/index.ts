/**
 * @agent-blueprint/templates — the artifacts a user starts from.
 *
 * A template never mutates a Blueprint: it returns a ChangeSet, so "start from template" and
 * "generate with AI" land in the same review surface and the user always sees what is about
 * to be added.
 *
 * This entry point reads the starter blueprints from disk and therefore requires Node. Code
 * that runs in a browser imports `@agent-blueprint/templates/artifacts` instead, which holds
 * the per-artifact templates and nothing that touches the file system.
 */
export * from './types'
export * from './artifacts/index'
export { readStarterFiles, starterBlueprints, starterById, starterIds } from './blueprints/index'
