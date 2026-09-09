import { starterBlueprints } from '@agent-blueprint/templates'

import { Dashboard } from '@/components/dashboard/dashboard'

/**
 * The starter catalogue is read from disk by the templates package, so the list is built on
 * the server and handed to the client component as plain data.
 */
export default function DashboardPage() {
  const starters = starterBlueprints.map(({ id, label, description }) => ({
    id,
    label,
    description,
  }))
  return <Dashboard starters={starters} />
}
