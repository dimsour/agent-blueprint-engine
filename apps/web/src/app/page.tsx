import { BLUEPRINT_SCHEMA_VERSION, ENTITY_KINDS } from '@agent-blueprint/core'

/**
 * Placeholder dashboard. Replaced in roadmap phase P3 (docs/09-roadmap.md).
 * It imports from @agent-blueprint/core on purpose: it proves the workspace wiring.
 */
export default function DashboardPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Agent Blueprint
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Design once. Test it. Compile it everywhere.
        </h1>
        <p className="text-muted-foreground text-sm">
          Workspace scaffold is in place. The IDE shell is roadmap phase P3.
        </p>
      </header>

      <section className="rounded-md border p-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt className="text-muted-foreground">Blueprint schema</dt>
          <dd className="font-mono">{BLUEPRINT_SCHEMA_VERSION}</dd>
          <dt className="text-muted-foreground">Entity kinds</dt>
          <dd className="font-mono">{ENTITY_KINDS.join(' · ')}</dd>
        </dl>
      </section>
    </main>
  )
}
