/**
 * Step two: GitHub sends the browser back here with a code, and this exchanges it for a token.
 *
 * Three things have to be true of this handler, and they are the reason it is written out
 * rather than pulled from a library:
 *
 * 1. The `state` must match the cookie set at step one, or the code is not one we asked for.
 * 2. The token is delivered to the page that started this, once, through `postMessage`. It is
 *    not set as a cookie, not put in the redirect URL, not stored anywhere on the server.
 * 3. Nothing is logged on success; on failure, the error class and status and nothing else.
 *
 * (docs/08-security.md.)
 */
import {
  appOrigin,
  deliveryPage,
  logOAuthFailure,
  oauthConfig,
  readStateCookie,
  sameState,
  TOKEN_URL,
} from '@/lib/github/oauth-server'

export const dynamic = 'force-dynamic'

interface ExchangeResult {
  access_token?: string
  token_type?: string
  error?: string
  error_description?: string
}

export async function GET(request: Request): Promise<Response> {
  const config = oauthConfig()
  if (!config) {
    return Response.json(
      { error: { message: 'GitHub sign-in is not configured for this deployment.' } },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    )
  }

  const origin = appOrigin(request)
  const params = new URL(request.url).searchParams

  // GitHub reports a user who declined here, and it is not a failure worth a log line.
  const refused = params.get('error')
  if (refused) {
    return deliveryPage(origin, {
      error: params.get('error_description') ?? 'GitHub sign-in was cancelled.',
    })
  }

  if (!sameState(params.get('state') ?? undefined, readStateCookie(request))) {
    logOAuthFailure('state mismatch')
    return deliveryPage(origin, {
      error: 'That sign-in did not start here. Try again from Settings.',
    })
  }

  const code = params.get('code')
  if (!code) {
    logOAuthFailure('no code')
    return deliveryPage(origin, { error: 'GitHub did not return an authorization code.' })
  }

  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: `${origin}/api/github/oauth/callback`,
      }),
      cache: 'no-store',
    })
  } catch {
    logOAuthFailure('exchange unreachable')
    return deliveryPage(origin, { error: 'Could not reach GitHub to complete sign-in.' })
  }

  if (!response.ok) {
    logOAuthFailure('exchange rejected', response.status)
    return deliveryPage(origin, { error: 'GitHub refused to complete sign-in.' })
  }

  const result = (await response.json().catch(() => ({}))) as ExchangeResult
  if (!result.access_token) {
    // `error_description` is GitHub's own sentence about the exchange; it carries no code,
    // no state and no token, which is why it is the one part of the body that may be shown.
    logOAuthFailure(result.error ?? 'no token', response.status)
    return deliveryPage(origin, {
      error: result.error_description ?? 'GitHub did not return a token.',
    })
  }

  return deliveryPage(origin, { token: result.access_token })
}
