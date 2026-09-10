/**
 * Talking to GitHub.
 *
 * This is a few dozen lines of `fetch` rather than Octokit, for the same reasons the AI client
 * is not a vendor SDK (ADR-12, ADR-23): the app needs a handful of endpoints, it runs in a
 * browser where every kilobyte is paid for by the user, and a token is involved. That last one
 * matters most. Errors from here are constructed by hand, so there is no path by which a
 * request's headers end up inside a message, a `toString()` or a stack — which is exactly the
 * failure that puts a token into a toast or a console (docs/08-security.md).
 *
 * What comes back is narrowed to the fields the app uses. GitHub's responses are large and
 * mostly irrelevant, and typing them in full would be typing GitHub's API rather than ours.
 */

const API_BASE = 'https://api.github.com'

/** The version this code was written against. GitHub keeps old versions working when asked. */
const API_VERSION = '2022-11-28'

export type GitHubErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'rate-limited'
  | 'conflict'
  | 'invalid'
  | 'network'
  | 'server'
  | 'unknown'

export class GitHubError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

export interface GitHubRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
  /** Some endpoints answer 404 in the ordinary course of things; the caller wants a value. */
  allowMissing?: boolean
}

export interface GitHubResponse<T> {
  data: T
  headers: Headers
}

/**
 * One request, with the token attached and nothing about it kept.
 *
 * The token is a parameter rather than a field on a long-lived object on purpose: it lives on
 * the stack of the call that needs it, and nothing here closes over it.
 */
export async function githubRequest<T>(
  token: string,
  request: GitHubRequest,
): Promise<GitHubResponse<T>> {
  const url = new URL(request.path.startsWith('http') ? request.path : API_BASE + request.path)
  for (const [name, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value))
  }

  const headers = new Headers({
    accept: 'application/vnd.github+json',
    'x-github-api-version': API_VERSION,
  })
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (request.body !== undefined) headers.set('content-type', 'application/json')

  let response: Response
  try {
    response = await fetch(url, {
      method: request.method ?? 'GET',
      headers,
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      cache: 'no-store',
    })
  } catch {
    // Offline, DNS, a corporate proxy: none of them tell us anything we could pass on
    // usefully, and the browser's own message is not worth repeating.
    throw new GitHubError('network', 'Could not reach GitHub.')
  }

  if (response.status === 204 || response.status === 205) {
    return { data: undefined as T, headers: response.headers }
  }

  const text = await response.text()
  const parsed = parseJson(text)

  if (!response.ok) {
    if (response.status === 404 && request.allowMissing) {
      return { data: undefined as T, headers: response.headers }
    }
    throw errorFor(response, parsed)
  }

  return { data: parsed as T, headers: response.headers }
}

/**
 * Every page of a list, following GitHub's own `Link` header.
 *
 * Guessing the next page from a count is how a list quietly truncates when a page size
 * changes; the header is what GitHub says is next, and the absence of it is what "that was all"
 * looks like. The cap is there because an account with more repositories than this has a search
 * box, not a scrollbar, and a runaway loop against a rate-limited API is worse than a short list.
 */
export async function githubPaginate<T>(
  token: string,
  request: GitHubRequest,
  maxPages = 10,
): Promise<T[]> {
  const { query: firstQuery, ...rest } = request
  const items: T[] = []
  let next: string | undefined = request.path
  let query = firstQuery

  for (let page = 0; next && page < maxPages; page += 1) {
    const response: GitHubResponse<T[]> = await githubRequest<T[]>(token, {
      ...rest,
      path: next,
      ...(query ? { query } : {}),
    })
    if (Array.isArray(response.data)) items.push(...response.data)
    next = nextPageUrl(response.headers)
    // The `Link` URL already carries the query; re-adding ours would overwrite its cursor.
    query = undefined
  }
  return items
}

function nextPageUrl(headers: Headers): string | undefined {
  const link = headers.get('link')
  if (!link) return undefined
  for (const part of link.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part.trim())
    if (match) return match[1]
  }
  return undefined
}

function parseJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * GitHub's own words where they help, ours where they do not.
 *
 * A 403 is two very different situations — out of quota, or not allowed — and the difference
 * is in a header rather than in the status. Telling them apart here is what lets the UI say
 * "wait" instead of "get a better token".
 */
function errorFor(response: Response, body: unknown): GitHubError {
  const said = messageOf(body)
  const status = response.status

  if (status === 401) {
    return new GitHubError('unauthorized', 'GitHub did not accept that token.', status)
  }
  if (status === 403 || status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining')
    if (status === 429 || remaining === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset'))
      const wait = Number.isFinite(reset) ? resetWording(reset) : 'again shortly'
      return new GitHubError(
        'rate-limited',
        `GitHub is rate limiting this token. Try ${wait}.`,
        status,
      )
    }
    return new GitHubError(
      'forbidden',
      said ?? 'This token is not allowed to do that. Check its repository access and permissions.',
      status,
    )
  }
  if (status === 404) {
    return new GitHubError(
      'not-found',
      said ?? 'Not found. A fine-grained token also answers 404 for a repository it cannot see.',
      status,
    )
  }
  if (status === 409) {
    return new GitHubError(
      'conflict',
      said ?? 'That has changed on GitHub since it was read.',
      status,
    )
  }
  if (status === 422) {
    return new GitHubError('invalid', said ?? 'GitHub rejected that request.', status)
  }
  if (status >= 500)
    return new GitHubError('server', 'GitHub had a problem with that request.', status)
  return new GitHubError('unknown', said ?? `GitHub answered ${status}.`, status)
}

function messageOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const { message, errors } = body as { message?: unknown; errors?: unknown }
  if (typeof message !== 'string') return undefined
  // A 422 carries the useful part in `errors`; the message alone is "Validation Failed".
  const detail = Array.isArray(errors)
    ? errors
        .map((entry) =>
          typeof entry === 'object' && entry !== null && 'message' in entry
            ? String((entry as { message: unknown }).message)
            : undefined,
        )
        .filter(Boolean)
        .join('; ')
    : ''
  return detail ? `${message}: ${detail}` : message
}

function resetWording(resetEpochSeconds: number): string {
  const minutes = Math.ceil((resetEpochSeconds * 1000 - Date.now()) / 60_000)
  if (!Number.isFinite(minutes) || minutes <= 0) return 'again shortly'
  return minutes === 1 ? 'in a minute' : `in about ${minutes} minutes`
}

export interface GitHubViewer {
  login: string
  name?: string
  avatarUrl?: string
  /**
   * What a classic token carries, from the `x-oauth-scopes` header. A fine-grained token has
   * none: its permissions are per repository and are not reported here, which is why the UI
   * can only say what such a token is able to do by trying it.
   */
  scopes: string[]
}

/** Who the token belongs to. The cheapest call that proves a token works. */
export async function viewer(token: string): Promise<GitHubViewer> {
  const { data, headers } = await githubRequest<{
    login: string
    name: string | null
    avatar_url: string | null
  }>(token, { path: '/user' })

  const scopes = (headers.get('x-oauth-scopes') ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)

  return {
    login: data.login,
    ...(data.name ? { name: data.name } : {}),
    ...(data.avatar_url ? { avatarUrl: data.avatar_url } : {}),
    scopes,
  }
}
