/**
 * The closed set of entity kinds a Blueprint contains, and how each kind is stored on disk.
 *
 * Keep this table in sync with `schema/blueprint.ts` (collection keys) and
 * `project/layout.ts` (paths). A type-level assertion in `schema/blueprint.ts` fails the
 * build if a collection key here has no matching Blueprint field.
 */
export const ENTITY_KINDS = [
  'agent',
  'skill',
  'workflow',
  'iron-law',
  'rule',
  'hook',
  'gate',
  'tool',
  'reference',
  'memory',
  'requirement',
  'scenario',
] as const

export type EntityKind = (typeof ENTITY_KINDS)[number]

/** On-disk representation of an entity kind. */
export type EntityFormat =
  /** `<dir>/<id>.md` — YAML frontmatter holds the fields, the body is Markdown. */
  | 'markdown'
  /** `skills/<id>/SKILL.md` plus sibling resource files. */
  | 'skill'
  /** `workflows/<id>.md` (description) + `workflows/<id>.workflow.json` (graph). */
  | 'workflow'
  /** `<dir>/<id>.yaml` — the whole entity as YAML. */
  | 'yaml'

export interface EntityKindInfo {
  readonly kind: EntityKind
  /** Field name of the collection on the Blueprint object. */
  readonly collection: BlueprintCollectionKey
  /** Directory name under the blueprint source directory. */
  readonly dir: string
  readonly format: EntityFormat
  readonly label: string
  readonly pluralLabel: string
}

export const BLUEPRINT_COLLECTION_KEYS = [
  'agents',
  'skills',
  'workflows',
  'ironLaws',
  'rules',
  'hooks',
  'gates',
  'tools',
  'references',
  'memories',
  'requirements',
  'scenarios',
] as const

export type BlueprintCollectionKey = (typeof BLUEPRINT_COLLECTION_KEYS)[number]

export const ENTITY_KIND_INFO: Readonly<Record<EntityKind, EntityKindInfo>> = {
  agent: {
    kind: 'agent',
    collection: 'agents',
    dir: 'agents',
    format: 'markdown',
    label: 'Agent',
    pluralLabel: 'Agents',
  },
  skill: {
    kind: 'skill',
    collection: 'skills',
    dir: 'skills',
    format: 'skill',
    label: 'Skill',
    pluralLabel: 'Skills',
  },
  workflow: {
    kind: 'workflow',
    collection: 'workflows',
    dir: 'workflows',
    format: 'workflow',
    label: 'Workflow',
    pluralLabel: 'Workflows',
  },
  'iron-law': {
    kind: 'iron-law',
    collection: 'ironLaws',
    dir: 'laws',
    format: 'markdown',
    label: 'Iron Law',
    pluralLabel: 'Iron Laws',
  },
  rule: {
    kind: 'rule',
    collection: 'rules',
    dir: 'rules',
    format: 'markdown',
    label: 'Rule',
    pluralLabel: 'Rules',
  },
  hook: {
    kind: 'hook',
    collection: 'hooks',
    dir: 'hooks',
    format: 'yaml',
    label: 'Hook',
    pluralLabel: 'Hooks',
  },
  gate: {
    kind: 'gate',
    collection: 'gates',
    dir: 'gates',
    format: 'yaml',
    label: 'Gate',
    pluralLabel: 'Gates',
  },
  tool: {
    kind: 'tool',
    collection: 'tools',
    dir: 'tools',
    format: 'yaml',
    label: 'Tool',
    pluralLabel: 'Tools',
  },
  reference: {
    kind: 'reference',
    collection: 'references',
    dir: 'references',
    format: 'markdown',
    label: 'Reference',
    pluralLabel: 'References',
  },
  memory: {
    kind: 'memory',
    collection: 'memories',
    dir: 'memory',
    format: 'markdown',
    label: 'Memory',
    pluralLabel: 'Memory',
  },
  requirement: {
    kind: 'requirement',
    collection: 'requirements',
    dir: 'requirements',
    format: 'markdown',
    label: 'Requirement',
    pluralLabel: 'Requirements',
  },
  scenario: {
    kind: 'scenario',
    collection: 'scenarios',
    dir: 'scenarios',
    format: 'yaml',
    label: 'Scenario',
    pluralLabel: 'Scenarios',
  },
}

const KIND_BY_COLLECTION: Readonly<Record<BlueprintCollectionKey, EntityKind>> = Object.fromEntries(
  ENTITY_KINDS.map((kind) => [ENTITY_KIND_INFO[kind].collection, kind]),
) as Record<BlueprintCollectionKey, EntityKind>

const KIND_BY_DIR: ReadonlyMap<string, EntityKind> = new Map(
  ENTITY_KINDS.map((kind) => [ENTITY_KIND_INFO[kind].dir, kind]),
)

export function kindForCollection(collection: BlueprintCollectionKey): EntityKind {
  return KIND_BY_COLLECTION[collection]
}

export function kindForDir(dir: string): EntityKind | undefined {
  return KIND_BY_DIR.get(dir)
}

export function isEntityKind(value: unknown): value is EntityKind {
  return typeof value === 'string' && (ENTITY_KINDS as readonly string[]).includes(value)
}

/** Harness identifiers known to the compiler. Adapters live in @agent-blueprint/exporters. */
export const HARNESS_IDS = ['claude-code', 'codex', 'copilot', 'opencode', 'pi'] as const
export type HarnessId = (typeof HARNESS_IDS)[number]

export const HARNESS_LABELS: Readonly<Record<HarnessId, string>> = {
  'claude-code': 'Claude Code',
  codex: 'OpenAI Codex',
  copilot: 'GitHub Copilot',
  opencode: 'OpenCode',
  pi: 'Pi',
}
