import { starterBlueprints } from '@agent-blueprint/templates'
import { NextResponse } from 'next/server'

/**
 * The starter catalogue. The templates package reads its projects from disk, so it can only
 * be imported on the server; the dashboard fetches this list rather than bundling it.
 */
export function GET() {
  return NextResponse.json(
    starterBlueprints.map(({ id, label, description }) => ({ id, label, description })),
  )
}
