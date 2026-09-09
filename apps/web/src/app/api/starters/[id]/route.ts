import { readStarterFiles, starterIds } from '@agent-blueprint/templates'
import { NextResponse } from 'next/server'

/** The file map of one starter, ready to be written into a project store. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!starterIds.includes(id)) {
    return NextResponse.json({ error: `No starter named "${id}".` }, { status: 404 })
  }
  return NextResponse.json({ id, files: readStarterFiles(id) })
}
