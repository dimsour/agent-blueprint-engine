/**
 * Step one of GitHub sign-in: send the browser to GitHub with a `state` we can recognise.
 *
 * The state is the whole defence against someone else's authorization code being fed back into
 * this app. It is random, it lives in an `HttpOnly` cookie the page's own JavaScript cannot
 * read, and it is scoped to these two routes so it travels nowhere else.
 */
import {
  appOrigin,
  AUTHORIZE_URL,
  newState,
  oauthConfig,
  OAUTH_SCOPE,
  stateCookie,
} from '@/lib/github/oauth-server'

/** The environment is read per request: a deployment sets it, a build does not bake it in. */
export const dynamic = 'force-dynamic'

export function GET(request: Request): Response {
  const config = oauthConfig()
  if (!config) {
    return Response.json(
      { error: { message: 'GitHub sign-in is not configured for this deployment.' } },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    )
  }

  const origin = appOrigin(request)
  const state = newState()

  const authorize = new URL(AUTHORIZE_URL)
  authorize.searchParams.set('client_id', config.clientId)
  authorize.searchParams.set('redirect_uri', `${origin}/api/github/oauth/callback`)
  authorize.searchParams.set('scope', OAUTH_SCOPE)
  authorize.searchParams.set('state', state)

  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      'set-cookie': stateCookie(state, origin.startsWith('https')),
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  })
}
