/**
 * A relay for endpoints the browser is not allowed to call.
 *
 * A local Ollama or vLLM answers happily from a terminal and not at all from a page, because
 * it sends no CORS headers. The user can fix that at the endpoint (`OLLAMA_ORIGINS`, LM
 * Studio's CORS switch) and should; this route is for when they cannot.
 *
 * It exists under three rules, all from docs/08-security.md:
 *
 * 1. **It is not an open relay.** The upstream host must be on an allow-list, which defaults
 *    to localhost. A deployment that wants more says so in `AI_PROXY_ALLOWED_HOSTS`. Without
 *    this, a public deployment of this app is a free anonymising proxy for anyone who finds it.
 * 2. **The credential is passed through and never held.** It arrives under its own header
 *    name, is put on the upstream request, and outlives nothing. It is not read into a
 *    variable that survives the request, not stored, not logged.
 * 3. **Nothing is logged.** No bodies, no headers, no URLs. There is no failure mode here
 *    worth a log line that is worth the risk of one containing a key.
 */
import { endpointUrl } from '@agent-blueprint/ai'

/** Hosts the relay will talk to when the deployment says nothing. */
const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** The two header names an OpenAI-compatible endpoint uses for a key. */
const AUTH_HEADERS = new Set(['authorization', 'api-key'])

function allowedHosts(): string[] {
  const configured = process.env['AI_PROXY_ALLOWED_HOSTS']
  if (!configured) return DEFAULT_ALLOWED_HOSTS
  return configured
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}

function refuse(message: string, status: number): Response {
  return Response.json({ error: { message } }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  const upstreamBase = request.headers.get('x-ab-upstream-url')
  if (!upstreamBase) return refuse('No upstream endpoint was given.', 400)

  let target: URL
  try {
    target = new URL(endpointUrl(upstreamBase, 'chat/completions'))
  } catch {
    return refuse('The upstream endpoint is not a URL.', 400)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return refuse('The upstream endpoint must be http or https.', 400)
  }

  const host = target.hostname.toLowerCase()
  const allowed = allowedHosts()
  if (!allowed.includes('*') && !allowed.includes(host)) {
    // Naming the host is safe and saves the user guessing; naming the allow-list is not,
    // since it tells an unwanted caller what to try next.
    return refuse(`This deployment will not relay to ${host}.`, 403)
  }
  if (host === new URL(request.url).hostname && target.port === new URL(request.url).port) {
    return refuse('The upstream endpoint is this app.', 400)
  }

  const headers = new Headers({ 'content-type': 'application/json' })
  const credential = request.headers.get('x-ab-upstream-authorization')
  if (credential) {
    const name = (request.headers.get('x-ab-upstream-auth-header') ?? 'authorization').toLowerCase()
    headers.set(AUTH_HEADERS.has(name) ? name : 'authorization', credential)
  }
  // Anything else the endpoint needs travels as an ordinary header the client set.
  for (const [name, value] of request.headers) {
    if (name.startsWith('x-ab-') || headers.has(name)) continue
    if (name === 'host' || name === 'content-length' || name === 'connection') continue
    if (name === 'authorization' || name === 'cookie') continue
    if (name.startsWith('x-') || name === 'accept') headers.set(name, value)
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers,
      body: await request.text(),
      // The whole point is streaming a chat completion straight back to the page.
      cache: 'no-store',
    })
  } catch {
    return refuse(`Could not reach ${host}.`, 502)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
}
