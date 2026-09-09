/**
 * @agent-blueprint/ai — natural language in, reviewable ChangeSets out.
 *
 * Nothing here modifies a Blueprint. Operations return a `ChangeSet` that the web app shows
 * as a diff and the user accepts op by op (AGENTS.md rule 6). The client speaks the
 * OpenAI-compatible chat protocol over `fetch` against whatever endpoint the user configured.
 */
export * from './client/index'
export * from './context/index'
export * from './json-schema'
export * from './operations/index'
export * from './prompts/index'
export * from './schemas/index'
export * from './structured'
export * from './tokens'
