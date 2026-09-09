import { Workspace } from '@/components/workspace/workspace'

/** The project lives in the browser, so the route only resolves the id and hands it over. */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <Workspace projectId={projectId} />
}
