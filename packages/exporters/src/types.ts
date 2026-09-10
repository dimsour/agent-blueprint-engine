/**
 * The vocabulary every harness adapter speaks. See docs/04-compiler.md.
 *
 * Adapters are pure: they take a normalized Blueprint and return files and compatibility
 * issues. They never touch a file system, a clock, a random source or the network.
 */
import type {
  Blueprint,
  Diagnostic,
  EntityRef,
  HarnessId,
  ProjectFile,
} from '@agent-blueprint/core'
import type { ZodType } from 'zod'

/** The Blueprint concepts whose support differs between harnesses. */
export const CONCEPTS = [
  'skills',
  'agents',
  'parallelAgents',
  'workflows',
  'hooks',
  'gates',
  'permissions',
  'memory',
  'pathScopedRules',
  'commands',
  'ironLaws',
  'references',
] as const

export type Concept = (typeof CONCEPTS)[number]

export const CONCEPT_LABELS: Readonly<Record<Concept, string>> = {
  skills: 'Skills',
  agents: 'Agents',
  parallelAgents: 'Parallel agents',
  workflows: 'Workflows',
  hooks: 'Hooks',
  gates: 'Gates',
  permissions: 'Permissions',
  memory: 'Memory',
  pathScopedRules: 'Path-scoped rules',
  commands: 'Commands',
  ironLaws: 'Iron Laws',
  references: 'References',
}

/**
 * `native` the harness has the primitive; `adapted` we express it another way with the same
 * behaviour; `limited` we express part of it and something is lost; `unsupported` the harness
 * cannot do it at all and the Blueprint's intent is only documented.
 */
export type SupportLevel = 'native' | 'adapted' | 'limited' | 'unsupported'

export interface Capability {
  support: SupportLevel
  /** One or two sentences, rendered verbatim in the compatibility view. Never empty. */
  explanation: string
}

export type CapabilityMatrix = Record<Concept, Capability>

export type FileFormat = 'markdown' | 'json' | 'yaml' | 'toml' | 'typescript' | 'text' | 'binary'

/**
 * A file the compiler produced. `path` is repository-relative and POSIX-style. `content` is
 * text except for a `binary` file — a skill asset that is not text — which is the bytes
 * themselves, so a diagram or a font reaches the harness unchanged.
 */
export interface GeneratedFile {
  path: string
  content: ProjectFile
  format: FileFormat
  /** The harness that produced it, or `shared` when several harnesses read the same file. */
  owner: HarnessId | 'shared'
  /** Entities the file was generated from; empty for purely structural files. */
  sourceRefs: EntityRef[]
}

/** Something the Blueprint asks for that this harness cannot do natively. */
export interface CompatibilityIssue {
  harnessId: HarnessId
  concept: Concept
  support: Exclude<SupportLevel, 'native'>
  /** The artifact that triggered the issue, when there is one. */
  ref?: EntityRef
  message: string
  /** What the adapter emitted instead. */
  adaptation?: string
}

export interface CompileResult {
  files: GeneratedFile[]
  issues: CompatibilityIssue[]
}

export interface HarnessAdapter<Options = Record<string, unknown>> {
  readonly id: HarnessId
  readonly name: string
  /** Bumped whenever the output of `compile` changes. Recorded in build-manifest.json. */
  readonly version: string
  readonly docsUrl: string
  readonly capabilities: CapabilityMatrix
  /** Describes `TargetConfig.options` for this harness; the UI renders it as a form. */
  readonly optionsSchema: ZodType
  /** Parses raw target options. Throws a `ZodError` the pipeline turns into a diagnostic. */
  parseOptions(raw: unknown): Options
  validate(blueprint: Blueprint, options: Options): Diagnostic[]
  compile(blueprint: Blueprint, options: Options): CompileResult
}

/** Any adapter, for storage in the registry. Options are validated by the adapter itself. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous
export type AnyHarnessAdapter = HarnessAdapter<any>

export function generatedFile(
  path: string,
  content: ProjectFile,
  format: FileFormat,
  owner: HarnessId | 'shared',
  sourceRefs: EntityRef[] = [],
): GeneratedFile {
  return { path, content, format, owner, sourceRefs }
}
