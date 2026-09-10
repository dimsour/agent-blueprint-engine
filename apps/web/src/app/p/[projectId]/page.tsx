import type { Metadata } from 'next'

import { Workspace } from '@/components/workspace/workspace'

// The project name lives in the browser, so the route's own title is the honest one. Without
// it the tab is titled by the root layout only after the client transition settles, and for a
// moment the document has no title at all — which a screen reader announces as nothing.
export const metadata: Metadata = { title: 'Workspace · Agent Blueprint' }

/** The project lives in the browser, so the route only resolves the id and hands it over. */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <Workspace projectId={projectId} />
}
